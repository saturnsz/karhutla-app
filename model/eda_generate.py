"""
Membuat api/eda_data.json untuk fitur EDA (Exploratory Data Analysis).
Mengikuti sel-sel EDA pada notebook Karhutla2.ipynb:
  - 5 baris pertama dataset
  - peta sebaran titik panas (risiko rendah vs tinggi)
  - heatmap kepadatan titik panas
  - distribusi FRP (< 200 MW)
  - perbandingan siang (D) vs malam (N)
  - tren jumlah titik panas harian + puncak
  - Top 10 lokasi prioritas (darurat) dan 10 lokasi aman

Pemakaian:
    python model/eda_generate.py model/fire_nrt_M-C61_825606.csv
    python model/eda_generate.py model/fire_nrt_M-C61_825606.csv --geocode   # + nama daerah (butuh internet, ~1 detik/titik)
"""
import argparse
import json
import time
from pathlib import Path

import numpy as np
import pandas as pd

OUT_PATH = Path(__file__).resolve().parent.parent / "api" / "eda_data.json"

LAT_RANGE = (-4.5, 4.5)
LON_RANGE = (108.5, 119.5)
MIN_CONFIDENCE = 80
FRP_THRESHOLD = 30
HEAD_COLS = ["latitude", "longitude", "brightness", "acq_date", "acq_time",
             "confidence", "frp", "daynight"]
GRID = 0.25            # ukuran sel heatmap (derajat)
SCATTER_PER_CLASS = 1500   # maks titik per kelas untuk peta sebaran (agar JSON ringan)


def to_records(df: pd.DataFrame):
    """DataFrame -> list dict aman JSON (tipe numpy dikonversi)."""
    return json.loads(df.to_json(orient="records", force_ascii=False))


def describe(series: pd.Series) -> dict:
    return {
        "mean": round(float(series.mean()), 2),
        "median": round(float(series.median()), 2),
        "min": round(float(series.min()), 2),
        "max": round(float(series.max()), 2),
    }


def reverse_geocode(rows: list) -> None:
    """Menambah field 'lokasi' (sama seperti notebook: geopy Nominatim)."""
    from geopy.geocoders import Nominatim
    geolocator = Nominatim(user_agent="sistem_karhutla_kalimantan")

    for r in rows:
        try:
            loc = geolocator.reverse(f"{r['latitude']}, {r['longitude']}", language="id", timeout=10)
            if loc:
                parts = [x.strip() for x in loc.address.split(",")]
                r["lokasi"] = ", ".join(parts[-4:-1])
            else:
                r["lokasi"] = "Area Hutan/Tidak Terpetakan"
        except Exception:
            r["lokasi"] = "Gagal melacak lokasi"
        time.sleep(1)   # patuhi batas 1 permintaan/detik Nominatim


def main(csv_path: str, geocode: bool) -> None:
    raw = pd.read_csv(csv_path)

    # --- filter yang sama dengan notebook ---
    df = raw[
        (raw["latitude"] >= LAT_RANGE[0]) & (raw["latitude"] <= LAT_RANGE[1]) &
        (raw["longitude"] >= LON_RANGE[0]) & (raw["longitude"] <= LON_RANGE[1])
    ].copy()
    df = df[df["confidence"] >= MIN_CONFIDENCE].copy()
    df["acq_date"] = pd.to_datetime(df["acq_date"])
    df["target_risk"] = np.where(df["frp"] > FRP_THRESHOLD, 1, 0)

    n_dar = int(df["target_risk"].sum())

    # --- 1. ringkasan & 5 baris pertama ---
    summary = {
        "total_mentah": int(len(raw)),
        "total_kalimantan": int(len(df)),
        "darurat": n_dar,
        "aman": int(len(df) - n_dar),
        "persen_darurat": round(n_dar / len(df) * 100, 2),
        "tanggal_awal": df["acq_date"].min().strftime("%Y-%m-%d"),
        "tanggal_akhir": df["acq_date"].max().strftime("%Y-%m-%d"),
        "frp_threshold": FRP_THRESHOLD,
        "frp": describe(df["frp"]),
        "brightness": describe(df["brightness"]),
        "confidence": describe(df["confidence"]),
    }
    head5 = to_records(raw[HEAD_COLS].head(5))

    # --- 2. peta sebaran (sampel per kelas) ---
    parts = []
    for risk in (0, 1):
        sub = df[df["target_risk"] == risk]
        sub = sub.sample(n=min(len(sub), SCATTER_PER_CLASS), random_state=42)
        parts.append(sub)
    sc = pd.concat(parts)
    scatter = {
        "points": [[round(float(a), 4), round(float(b), 4), int(r), round(float(br), 1), round(float(cf), 1)]
                   for a, b, br, cf, r in zip(sc["latitude"], sc["longitude"], sc["brightness"], sc["confidence"], sc["target_risk"])],
        "dikirim": int(len(sc)),
        "total": int(len(df)),
    }

    # --- 3. heatmap kepadatan (histogram 2D) ---
    lon_edges = np.arange(LON_RANGE[0], LON_RANGE[1] + GRID, GRID)
    lat_edges = np.arange(LAT_RANGE[0], LAT_RANGE[1] + GRID, GRID)
    H, _, _ = np.histogram2d(df["longitude"], df["latitude"], bins=[lon_edges, lat_edges])
    cells = []
    for i in range(H.shape[0]):
        for j in range(H.shape[1]):
            if H[i, j] > 0:
                cells.append([round(lat_edges[j] + GRID / 2, 4),
                              round(lon_edges[i] + GRID / 2, 4),
                              int(H[i, j])])
    cells.sort(key=lambda c: -c[2])
    heatmap = {"grid": GRID, "max": int(H.max()), "cells": cells}

    # --- 4. distribusi FRP (< 200 MW) ---
    frp_low = df.loc[df["frp"] < 200, "frp"]
    counts, edges = np.histogram(frp_low, bins=50, range=(0, 200))
    frp_hist = {
        "counts": counts.tolist(),
        "edges": [round(float(e), 2) for e in edges],
        "di_atas_200": int((df["frp"] >= 200).sum()),
        "threshold": FRP_THRESHOLD,
    }

    # --- 5. siang vs malam ---
    dn = df.groupby("daynight").agg(total=("frp", "size"), darurat=("target_risk", "sum")).reset_index()
    day_night = [{"kode": r.daynight, "total": int(r.total), "darurat": int(r.darurat)}
                 for r in dn.itertuples()]

    # --- 6. tren harian ---
    daily = df.groupby("acq_date").size().reset_index(name="jumlah")
    peak = daily.loc[daily["jumlah"].idxmax()]
    trend = {
        "tanggal": daily["acq_date"].dt.strftime("%Y-%m-%d").tolist(),
        "jumlah": daily["jumlah"].astype(int).tolist(),
        "puncak": {"tanggal": peak["acq_date"].strftime("%Y-%m-%d"), "jumlah": int(peak["jumlah"])},
    }

    # --- 7 & 8. Top 10 darurat dan 10 aman ---
    cols = ["acq_date", "latitude", "longitude", "brightness", "frp", "confidence"]
    top = df[df["target_risk"] == 1].sort_values("frp", ascending=False).head(10)[cols].copy()
    aman = df[df["target_risk"] == 0].sort_values("frp", ascending=True).head(10)[cols].copy()
    for d in (top, aman):
        d["acq_date"] = d["acq_date"].dt.strftime("%Y-%m-%d")
    top_rows, aman_rows = to_records(top), to_records(aman)
    if geocode:
        print("Melacak nama daerah (butuh internet)...")
        reverse_geocode(top_rows)
        reverse_geocode(aman_rows)

    data = {
        "ringkasan": summary,
        "head5": head5,
        "sebaran": scatter,
        "heatmap": heatmap,
        "frp": frp_hist,
        "siangmalam": day_night,
        "tren": trend,
        "top10": top_rows,
        "aman10": aman_rows,
    }

    OUT_PATH.parent.mkdir(exist_ok=True)
    OUT_PATH.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    size_kb = OUT_PATH.stat().st_size / 1024
    print(f"Selesai: {OUT_PATH} ({size_kb:.0f} KB)")
    print(f"Total Kalimantan: {summary['total_kalimantan']} | Darurat: {n_dar} | Puncak: {trend['puncak']}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Generator data EDA karhutla Kalimantan")
    ap.add_argument("csv", help="path CSV NASA FIRMS")
    ap.add_argument("--geocode", action="store_true", help="tambahkan nama daerah via Nominatim")
    args = ap.parse_args()
    main(args.csv, args.geocode)
