# EDA (Exploratory Data Analysis) - Klasifikasi Wilayah Pemadaman Karhutla di Kalimantan

Dokumen ini adalah **fitur tambahan EDA** untuk sistem pada file `Klasifikasi_Wilayah_Pemadaman_Karhutla_Kalimantan.md`. Isinya mengikuti sel-sel EDA pada notebook `Karhutla2.ipynb`, lalu dijadikan fitur di aplikasi: pembuat data EDA (Python), endpoint API, dan tab **EDA** di frontend bertema Windows XP.

## Daftar Isi

1. [Ringkasan Fitur](#1-ringkasan-fitur)
2. [Hasil EDA dari Notebook](#2-hasil-eda-dari-notebook)
3. [Alur dan Struktur File](#3-alur-dan-struktur-file)
4. [Kode 1 - Pembuat Data EDA (`eda_generate.py`)](#4-kode-1---pembuat-data-eda-eda_generatepy)
5. [Kode 2 - Backend (endpoint `/api/eda`)](#5-kode-2---backend-endpoint-apieda)
6. [Kode 3 - Frontend (HTML, CSS, JS)](#6-kode-3---frontend-html-css-js)
7. [Cara Pakai dan Deploy ke Vercel](#7-cara-pakai-dan-deploy-ke-vercel)
8. [Dokumentasi API EDA](#8-dokumentasi-api-eda)
9. [Catatan dan Keterbatasan](#9-catatan-dan-keterbatasan)

---

## 1. Ringkasan Fitur

Delapan analisis EDA dari notebook tersedia lewat tab **EDA** (juga dari menu *Lihat* dan *Start Menu*). Pengguna memilih analisis dari daftar; grafik dan tabel tampil di panel kiri, sedangkan analisis spasial tampil di peta Leaflet di kanan.

| # | Analisis di aplikasi | Sel notebook asal | Tampil di |
|---|---|---|---|
| 1 | Ringkasan dataset + 5 baris pertama | `df.head(5)`, tabel PNG 300 DPI | Panel kiri (tabel) |
| 2 | Peta sebaran titik panas (risiko rendah vs tinggi) | `plt.scatter` oranye/merah | Peta kanan |
| 3 | Heatmap kepadatan (area rawan karhutla) | `sns.kdeplot` (cmap Reds) | Peta kanan |
| 4 | Distribusi FRP (< 200 MW) | `sns.histplot(..., bins=50, kde=True)` | Panel kiri (grafik SVG) |
| 5 | Siang (D) vs Malam (N) | `sns.countplot(x='daynight')` | Panel kiri (grafik SVG) |
| 6 | Tren titik panas harian + puncak | `plt.plot` + `annotate` puncak | Panel kiri (grafik SVG) |
| 7 | Top 10 lokasi prioritas pemadaman (darurat) | `sort_values('frp')` + reverse geocoding | Tabel + peta bernomor |
| 8 | Sampel 10 lokasi aman | `sort_values('frp', ascending=True)` | Tabel + peta bernomor |

Semua grafik digambar dengan **SVG buatan sendiri** (tanpa library tambahan), jadi ringan dan tidak bergantung CDN selain Leaflet yang sudah dipakai.

---

## 2. Hasil EDA dari Notebook

> Angka bertanda **±** dibaca dari grafik hasil notebook (bukan dari tabel angka), jadi bersifat perkiraan. Angka pasti akan tampil di aplikasi setelah `eda_generate.py` dijalankan dengan CSV asli.

### 2.1 Persiapan data

- Data: NASA FIRMS MODIS C6.1 NRT, Agustus - Oktober 2026.
- 5 baris pertama dataset berada di luar Kalimantan (longitude 134 - 140, kawasan timur Indonesia). Ini menunjukkan data mentah mencakup seluruh Indonesia, sehingga **filter bounding box Kalimantan** (lat -4.5 s.d. 4.5, lon 108.5 s.d. 119.5) dan **confidence ≥ 80** wajib dilakukan.
- Label: `target_risk = 1` bila `frp > 30` MW (DARURAT), selain itu `0` (AMAN).
- Setelah filter, jumlah titik sekitar **± 24.400** (jumlah siang + malam pada grafik no. 5).

### 2.2 Temuan utama

| Analisis | Temuan | Makna |
|---|---|---|
| Tren harian | **Puncak 1.704 titik pada 29 Agustus.** Lonjakan lain ± 1.330 (± 1 Sep), ± 1.070 (± 13 Okt), ± 1.000 (± 18 Sep), ± 930 (± 11 Sep). Awal Agustus relatif rendah (< ± 300 titik/hari). | Aktivitas karhutla berfluktuasi tajam dan bergelombang, bukan naik stabil. Hari-hari lonjakan perlu perhatian khusus. |
| Siang vs malam | Malam ± 15.600 titik, siang ± 8.800 titik (malam ± 64%). | Deteksi malam jauh lebih banyak. Perlu hati-hati: jumlah deteksi dipengaruhi jadwal lintasan satelit dan kemudahan mendeteksi api di malam hari, jadi bukan murni bukti api lebih sering menyala malam hari. |
| Distribusi FRP | Condong ke kanan (right-skewed). Modus sekitar 15 - 25 MW (± 2.200 titik per bin 4 MW), lalu menurun dengan ekor panjang sampai > 200 MW. | Sebagian besar titik berapi kecil. Ambang darurat 30 MW berada tepat di sisi kanan puncak, sehingga kelas DARURAT berisi api yang jauh lebih besar dari kebanyakan titik. |
| Heatmap kepadatan | Klaster terpadat di sekitar (110.2 BT, -1.8) wilayah Ketapang; (112.9, -2.8) sekitar Kotawaringin/Pangkalan Bun; (113.9, -2.2) dan (113.9, -3.1) sekitar Kapuas/Pulang Pisau. Klaster kecil di utara (117 - 118 BT, 2.2 LU). | Kerawanan terkonsentrasi di sabuk selatan Kalimantan (Kalimantan Barat bagian selatan sampai Kalimantan Tengah). Utara dan pedalaman timur jarang. |
| Peta sebaran | Titik risiko tinggi (merah) menumpuk di sabuk selatan yang sama; titik risiko rendah (oranye) lebih menyebar. | Konsisten dengan heatmap, mendukung prioritas pengerahan sumber daya ke wilayah selatan. |

### 2.3 Top 10 lokasi prioritas pemadaman (status DARURAT)

| # | Tanggal | Lokasi | Lat | Lon | FRP (MW) |
|---|---|---|---|---|---|
| 1 | 2026-10-11 | Kendawangan, Ketapang, Kalimantan Barat | -2.79958 | 110.69582 | 2488.53 |
| 2 | 2026-08-22 | Matan Hilir Selatan, Ketapang, Kalimantan Barat | -1.83287 | 110.19039 | 1705.29 |
| 3 | 2026-09-01 | Ketapang, Kalimantan Barat | -1.75217 | 110.16258 | 1621.93 |
| 4 | 2026-10-11 | Kendawangan, Ketapang, Kalimantan Barat | -2.79026 | 110.70202 | 1488.04 |
| 5 | 2026-09-18 | Kotawaringin Barat, Kalimantan Tengah | -2.50896 | 111.55318 | 1329.51 |
| 6 | 2026-10-18 | Matan Hilir Selatan, Ketapang, Kalimantan Barat | -1.88880 | 110.17416 | 1280.01 |
| 7 | 2026-09-11 | Pangkalan Bun, Kotawaringin Barat, Kalimantan Tengah | -2.59592 | 111.57973 | 1204.23 |
| 8 | 2026-09-01 | Pulang Pisau, Kalimantan Tengah | -3.22113 | 113.76171 | 1167.85 |
| 9 | 2026-09-22 | Kotabaru, Kalimantan Selatan | -3.76800 | 116.16291 | 1012.73 |
| 10 | 2026-08-28 | Kapuas, Kalimantan Tengah | -2.02030 | 114.15190 | 922.67 |

Semua titik di atas memiliki confidence 100%. Tujuh dari sepuluh titik berada di Kalimantan Barat bagian selatan (Ketapang) dan Kalimantan Tengah, selaras dengan heatmap.

### 2.4 Sampel 10 lokasi aman (FRP ≤ 30 MW)

| Tanggal | Lokasi | Lat | Lon | FRP (MW) |
|---|---|---|---|---|
| 2026-10-06 (7 titik) | Kendawangan, Ketapang, Kalimantan Barat | -2.83922 s.d. -2.86004 | 110.78379 s.d. 110.80657 | 0.00 |
| 2026-10-18 | Kapuas, Kalimantan Tengah | -1.43291 | 114.49563 | 6.45 |
| 2026-10-18 | Kapuas, Kalimantan Tengah | -2.20222 | 114.26504 | 6.67 |
| 2026-08-14 | Ketapang, Kalimantan Barat | -1.64836 | 110.05464 | 6.67 |

Menarik: sebagian titik aman berada di Kendawangan, kecamatan yang sama dengan titik darurat peringkat 1 dan 4. Wilayah yang sama dapat berisi titik besar dan kecil, sehingga klasifikasi per titik (bukan per wilayah) tetap diperlukan.

---

## 3. Alur dan Struktur File

```
                 (dijalankan sekali / saat data diperbarui)
 fire_nrt_...csv ──> model/eda_generate.py ──> api/eda_data.json (± 90 KB)
                                                      │
 Browser (tab EDA) ── GET /api/eda ──> api/index.py ──┘  (dibaca saat server start)
        │
        └─ public/eda.js: gambar grafik SVG (kiri) + lapisan Leaflet (kanan)
```

File yang **ditambah atau diubah** terhadap proyek sebelumnya:

```
karhutla-app/
├── api/
│   ├── index.py          # DIUBAH: tambah endpoint GET /api/eda
│   └── eda_data.json     # BARU: dibuat oleh eda_generate.py
├── model/
│   └── eda_generate.py   # BARU
└── public/
    ├── index.html        # DIUBAH: tab EDA, panel EDA, menu, script eda.js
    ├── style.css         # DIUBAH: tambah gaya EDA di bagian akhir
    └── eda.js            # BARU
```

Alasan data EDA dihitung di muka (bukan saat permintaan): CSV FIRMS tidak ikut dideploy ke Vercel, dan menghitung puluhan ribu baris di setiap request akan lambat. Hasil ringkas disimpan sebagai JSON statis.

---

## 4. Kode 1 - Pembuat Data EDA (`eda_generate.py`)

Logika filter dan label sama persis dengan notebook. Output: `api/eda_data.json`.

**`model/eda_generate.py`**

```python
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
        "points": [[round(a, 4), round(b, 4), int(r)]
                   for a, b, r in zip(sc["latitude"], sc["longitude"], sc["target_risk"])],
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
```

---

## 5. Kode 2 - Backend (endpoint `/api/eda`)

Tambahkan dua potongan berikut pada `api/index.py` (sudah ada di versi proyek terbaru).

**a. Memuat data EDA** (letakkan di dekat pemuatan model)

```python
# Data EDA hasil model/eda_generate.py (opsional)
EDA_PATH = BASE_DIR / "eda_data.json"
EDA = json.loads(EDA_PATH.read_text(encoding="utf-8")) if EDA_PATH.exists() else None
```

**b. Endpoint baru** (letakkan sebelum `@app.post("/api/predict")`)

```python
@app.get("/api/eda")
def eda():
    """Data EDA. Opsional ?section=ringkasan|sebaran|heatmap|frp|siangmalam|tren|top10|aman10"""
    if EDA is None:
        return jsonify({"error": "Data EDA belum tersedia. Jalankan model/eda_generate.py "
                                 "lalu letakkan api/eda_data.json."}), 503
    section = request.args.get("section")
    if section:
        if section not in EDA:
            return jsonify({"error": "Section tidak dikenal.", "tersedia": list(EDA.keys())}), 404
        body = jsonify({section: EDA[section]})
    else:
        body = jsonify(EDA)
    body.headers["Cache-Control"] = "public, max-age=3600"
    return body
```

---

## 6. Kode 3 - Frontend (HTML, CSS, JS)

### 6.1 Perubahan `public/index.html`

**a. Tombol tab** (tambahkan setelah tab Model):

```html
<button type="button" role="tab" class="tab" data-tab="eda" aria-selected="false">EDA</button>
```

**b. Panel EDA** (tambahkan di dalam `.tab-panels`, setelah panel `tab-model`):

```html
            <!-- TAB: EDA -->
            <div class="panel" id="tab-eda" role="tabpanel" hidden>
              <fieldset>
                <legend>Eksplorasi Data (EDA)</legend>
                <label for="eda-select">Pilih analisis
                  <select id="eda-select" class="xp-select">
                    <option value="ringkasan">1. Ringkasan dataset</option>
                    <option value="sebaran">2. Peta sebaran titik panas</option>
                    <option value="heatmap">3. Heatmap kepadatan (area rawan)</option>
                    <option value="frp">4. Distribusi FRP (kekuatan api)</option>
                    <option value="siangmalam">5. Siang vs malam</option>
                    <option value="tren">6. Tren harian titik panas</option>
                    <option value="top10">7. Top 10 prioritas pemadaman</option>
                    <option value="aman10">8. Sampel 10 lokasi aman</option>
                  </select>
                </label>
              </fieldset>
              <p id="eda-error" class="inline-error" role="alert" hidden></p>
              <div id="eda-output"></div>
            </div>
```

**c. Menu** (opsional, agar bisa dibuka dari menu *Lihat* dan *Start Menu*):

```html
<!-- di menu Lihat -->
<li><button type="button" data-action="tab-eda">Eksplorasi Data (EDA)</button></li>

<!-- di Start Menu -->
<li><button type="button" data-action="tab-eda">🔎 Eksplorasi Data (EDA)</button></li>
```

**d. Muat skrip** (tepat setelah `script.js`):

```html
<script src="script.js"></script>
<script src="eda.js"></script>
```

### 6.2 Tambahan `public/style.css` (di bagian akhir file)

```css
/* ============================================================
   Fitur EDA
   ============================================================ */
.xp-select {
  width: 100%; margin-top: 4px; padding: 3px 4px;
  font: 13px var(--font); color: #000; background: #fff;
  border: 1px solid var(--xp-sunken); border-radius: 0;
}
.xp-select:focus { outline: 1px dotted #000; outline-offset: -3px; }

#eda-output h3 { margin: 14px 0 6px; font: bold 13px var(--font); color: var(--xp-link); }
#eda-output h3:first-child { margin-top: 4px; }
.eda-note { margin: 8px 0; padding: 6px 8px; background: #ffffe1; border: 1px solid #000; font-size: 12px; }

.eda-svg { display: block; width: 100%; height: auto; background: #fff; border: 2px inset #aca899; }
.eda-svg text { font: 10px var(--font); fill: #222; }
.eda-svg .tick { font-size: 10px; }
.eda-svg .lbl { font: bold 11px var(--font); }
.eda-svg .peak { font: bold 11px var(--font); }
.eda-svg .grid { stroke: #ddd; stroke-dasharray: 3 3; }
.eda-svg .axis { stroke: #444; }

.heat-legend { display: flex; align-items: center; gap: 8px; font-size: 12px; margin: 4px 0; }
.heat-legend i { display: block; width: 160px; height: 12px; border: 1px solid #686868; background: linear-gradient(90deg, rgb(254,229,217), rgb(153,0,13)); }

.eda-star {
  width: 24px; height: 24px; border-radius: 50%; border: 2px solid #000;
  display: grid; place-items: center; color: #fff; font: bold 11px var(--font);
  box-shadow: 1px 2px 3px rgba(0,0,0,.5);
}
.eda-star.red { background: #e01010; }
.eda-star.green { background: #1f9d36; }
```

### 6.3 `public/eda.js`

`eda.js` memakai variabel global dari `script.js` (`map`, `markerLayer`, `$`, `escapeHtml`, `showError`, `setStatus`, `setBusy`, `API_BASE`), jadi **harus dimuat setelah** `script.js`.

```javascript
/* Fitur EDA (Exploratory Data Analysis) - mengikuti sel EDA pada notebook Karhutla2.ipynb.
   Bergantung pada script.js (map, markerLayer, $, escapeHtml, setStatus, setBusy, API_BASE). */
(() => {
  const edaLayer = L.layerGroup().addTo(map);
  const canvas = L.canvas({ padding: 0.5 });
  let EDA = null;

  const fmt = (n) => Number(n).toLocaleString("id-ID");
  const fmt2 = (n) => Number(n).toLocaleString("id-ID", { maximumFractionDigits: 2 });
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const shortDate = (iso) => `${+iso.slice(8, 10)} ${MONTHS[+iso.slice(5, 7) - 1]}`;

  /* ---------------- data ---------------- */
  async function loadEda() {
    if (EDA) return EDA;
    const res = await fetch(API_BASE + "/api/eda");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Data EDA tidak dapat dimuat.");
    EDA = data;
    return EDA;
  }

  /* ---------------- helper SVG ---------------- */
  const W = 520, H = 270, M = { l: 52, r: 14, t: 18, b: 44 };
  const iw = W - M.l - M.r, ih = H - M.t - M.b;

  function niceMax(v) {
    const p = Math.pow(10, Math.floor(Math.log10(v || 1)));
    const f = v / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
  }

  function axes(yMax, xLabel, yLabel) {
    let g = "";
    for (let i = 0; i <= 5; i++) {
      const v = (yMax / 5) * i;
      const y = M.t + ih - (v / yMax) * ih;
      g += `<line x1="${M.l}" x2="${W - M.r}" y1="${y}" y2="${y}" class="grid"/>`;
      g += `<text x="${M.l - 6}" y="${y + 4}" text-anchor="end">${fmt(Math.round(v))}</text>`;
    }
    g += `<line x1="${M.l}" x2="${M.l}" y1="${M.t}" y2="${M.t + ih}" class="axis"/>`;
    g += `<line x1="${M.l}" x2="${W - M.r}" y1="${M.t + ih}" y2="${M.t + ih}" class="axis"/>`;
    g += `<text x="${M.l + iw / 2}" y="${H - 6}" text-anchor="middle" class="lbl">${xLabel}</text>`;
    g += `<text transform="translate(12 ${M.t + ih / 2}) rotate(-90)" text-anchor="middle" class="lbl">${yLabel}</text>`;
    return g;
  }

  const svgWrap = (inner, label) =>
    `<svg class="eda-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(label)}">${inner}</svg>`;

  function lineChart(t) {
    const n = t.jumlah.length;
    const yMax = niceMax(Math.max(...t.jumlah));
    const x = (i) => M.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
    const y = (v) => M.t + ih - (v / yMax) * ih;

    let g = axes(yMax, "Tanggal kejadian", "Jumlah titik panas");
    const step = Math.max(1, Math.round(n / 8));
    for (let i = 0; i < n; i += step) {
      g += `<text x="${x(i)}" y="${M.t + ih + 15}" text-anchor="middle" class="tick">${shortDate(t.tanggal[i])}</text>`;
    }
    g += `<polyline fill="none" stroke="#e91e63" stroke-width="2" points="${t.jumlah.map((v, i) => `${x(i)},${y(v)}`).join(" ")}"/>`;
    t.jumlah.forEach((v, i) => {
      g += `<circle cx="${x(i)}" cy="${y(v)}" r="2.6" fill="#e91e63"><title>${shortDate(t.tanggal[i])}: ${fmt(v)} titik</title></circle>`;
    });
    const pi = t.tanggal.indexOf(t.puncak.tanggal);
    const px = x(pi), py = y(t.puncak.jumlah);
    const tx = Math.min(Math.max(px, M.l + 70), W - M.r - 70);
    g += `<circle cx="${px}" cy="${py}" r="5" fill="none" stroke="#000" stroke-width="1.5"/>`;
    g += `<text x="${tx}" y="${py - 8}" text-anchor="middle" class="peak">Puncak: ${fmt(t.puncak.jumlah)} titik (${shortDate(t.puncak.tanggal)})</text>`;
    return svgWrap(g, "Tren jumlah titik panas harian");
  }

  function histChart(h) {
    const n = h.counts.length;
    const yMax = niceMax(Math.max(...h.counts));
    const bw = iw / n;
    const xv = (v) => M.l + (v / h.edges[n]) * iw;

    let g = axes(yMax, "FRP (Megawatts)", "Jumlah titik panas");
    h.counts.forEach((c, i) => {
      const bh = (c / yMax) * ih;
      g += `<rect x="${M.l + i * bw + 0.5}" y="${M.t + ih - bh}" width="${bw - 1}" height="${bh}" fill="#d98c8c" stroke="#8a2b2b" stroke-width=".6">` +
           `<title>${h.edges[i]}-${h.edges[i + 1]} MW: ${fmt(c)} titik</title></rect>`;
    });
    for (let v = 0; v <= h.edges[n]; v += 25) {
      g += `<text x="${xv(v)}" y="${M.t + ih + 15}" text-anchor="middle" class="tick">${v}</text>`;
    }
    const tx = xv(h.threshold);
    g += `<line x1="${tx}" x2="${tx}" y1="${M.t}" y2="${M.t + ih}" stroke="#cc2200" stroke-width="1.6" stroke-dasharray="5 4"/>`;
    g += `<text x="${tx + 5}" y="${M.t + 11}" class="peak" fill="#cc2200">Ambang darurat ${h.threshold} MW</text>`;
    return svgWrap(g, "Distribusi FRP di bawah 200 MW");
  }

  function barChart(rows) {
    const yMax = niceMax(Math.max(...rows.map((r) => r.total)));
    const colors = { D: "#66c2a5", N: "#fc8d62" };
    const names = { D: "Siang (D)", N: "Malam (N)" };
    const slot = iw / rows.length, bw = Math.min(110, slot * 0.6);

    let g = axes(yMax, "Waktu (Day / Night)", "Total titik panas");
    rows.forEach((r, i) => {
      const bh = (r.total / yMax) * ih;
      const bx = M.l + slot * i + (slot - bw) / 2;
      g += `<rect x="${bx}" y="${M.t + ih - bh}" width="${bw}" height="${bh}" fill="${colors[r.kode] || "#8da0cb"}" stroke="#444" stroke-width=".7"/>`;
      g += `<text x="${bx + bw / 2}" y="${M.t + ih - bh - 5}" text-anchor="middle" class="peak">${fmt(r.total)}</text>`;
      g += `<text x="${bx + bw / 2}" y="${M.t + ih + 15}" text-anchor="middle" class="tick">${names[r.kode] || r.kode}</text>`;
    });
    return svgWrap(g, "Perbandingan titik panas siang dan malam");
  }

  /* ---------------- helper tabel ---------------- */
  function table(headers, rows) {
    return `<div class="listview"><table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>` +
           `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }
  const note = (t) => `<p class="eda-note">${t}</p>`;

  /* ---------------- peta ---------------- */
  function clearMap() { edaLayer.clearLayers(); }

  function heatColor(r) {
    // skala akar agar area sedang tetap terlihat (putih-kemerahan -> merah tua)
    const t = Math.sqrt(r);
    const a = [254, 229, 217], b = [153, 0, 13];
    return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",")})`;
  }

  function starIcon(n, cls) {
    return L.divIcon({ className: "", html: `<div class="eda-star ${cls}">${n}</div>`, iconSize: [24, 24], iconAnchor: [12, 12] });
  }

  function drawPins(rows, cls) {
    const b = [];
    rows.forEach((r, i) => {
      L.marker([r.latitude, r.longitude], { icon: starIcon(i + 1, cls) })
        .bindPopup(`<strong>#${i + 1}</strong> ${r.acq_date}<br>FRP ${fmt2(r.frp)} MW<br>${r.lokasi ? escapeHtml(r.lokasi) + "<br>" : ""}Lat ${r.latitude}, Lon ${r.longitude}`)
        .addTo(edaLayer);
      b.push([r.latitude, r.longitude]);
    });
    if (b.length) map.fitBounds(b, { padding: [40, 40], maxZoom: 8 });
  }

  /* ---------------- render per bagian ---------------- */
  const R = {
    ringkasan(d) {
      const s = d.ringkasan;
      clearMap();
      const rows = [
        ["Total titik panas (data mentah)", fmt(s.total_mentah)],
        ["Setelah filter Kalimantan dan confidence ≥ 80", fmt(s.total_kalimantan)],
        [`DARURAT (FRP > ${s.frp_threshold} MW)`, `${fmt(s.darurat)} (${fmt2(s.persen_darurat)}%)`],
        [`AMAN (FRP ≤ ${s.frp_threshold} MW)`, fmt(s.aman)],
        ["Rentang tanggal", `${s.tanggal_awal} s.d. ${s.tanggal_akhir}`],
        ["FRP (MW): rata-rata / median / maks", `${fmt2(s.frp.mean)} / ${fmt2(s.frp.median)} / ${fmt2(s.frp.max)}`],
        ["Brightness (K): rata-rata / min / maks", `${fmt2(s.brightness.mean)} / ${fmt2(s.brightness.min)} / ${fmt2(s.brightness.max)}`],
        ["Confidence (%): rata-rata", fmt2(s.confidence.mean)],
      ];
      const head = d.head5.map((r) => [r.latitude, r.longitude, r.brightness, r.acq_date, r.acq_time, r.confidence, r.frp, r.daynight]);
      return `<h3>Ringkasan Dataset</h3>${table(["Keterangan", "Nilai"], rows)}` +
             `<h3>5 Baris Pertama Dataset</h3>${table(["Lat", "Lon", "Brightness", "Tanggal", "Waktu", "Conf.", "FRP", "D/N"], head)}` +
             note("Label DARURAT dibuat dari aturan FRP &gt; 30 MW, sama seperti proses pelatihan model.");
    },

    sebaran(d) {
      clearMap(); markerLayer.clearLayers();
      d.sebaran.points.forEach(([lat, lon, risk]) => {
        L.circleMarker([lat, lon], risk
          ? { renderer: canvas, radius: 4, color: "#b00000", fillColor: "#ff0000", fillOpacity: 0.85, weight: 0.5 }
          : { renderer: canvas, radius: 2.5, color: "#ff9800", fillColor: "#ffa500", fillOpacity: 0.35, weight: 0 }
        ).addTo(edaLayer);
      });
      map.fitBounds([[-4.5, 108.5], [4.5, 119.5]]);
      const s = d.sebaran;
      return `<h3>Peta Sebaran Titik Panas</h3>` +
             `<p><span class="dot red"></span> Risiko tinggi (darurat) &nbsp; <span class="dot" style="background:orange"></span> Risiko rendah (aman)</p>` +
             note(`Peta di sebelah kanan menampilkan ${fmt(s.dikirim)} titik sampel dari total ${fmt(s.total)} titik (maks. 1.500 per kelas agar tetap ringan).`);
    },

    heatmap(d) {
      clearMap(); markerLayer.clearLayers();
      const h = d.heatmap, g = h.grid / 2;
      h.cells.forEach(([lat, lon, c]) => {
        L.rectangle([[lat - g, lon - g], [lat + g, lon + g]], {
          renderer: canvas, stroke: false, fillColor: heatColor(c / h.max), fillOpacity: 0.8,
        }).bindTooltip(`${fmt(c)} titik`).addTo(edaLayer);
      });
      map.fitBounds([[-4.5, 108.5], [4.5, 119.5]]);
      const top = h.cells.slice(0, 3).map((c) => `(${c[0]}, ${c[1]})`).join("; ");
      return `<h3>Heatmap Kepadatan Titik Panas</h3>` +
             `<div class="heat-legend"><span>Rendah</span><i></i><span>Tinggi</span></div>` +
             note(`Sel terpadat (lat, lon): ${top}. Peta kanan memakai sel ${h.grid}° (histogram 2D); notebook memakai KDE, polanya serupa.`);
    },

    frp(d) {
      clearMap();
      const h = d.frp, total = h.counts.reduce((a, b) => a + b, 0);
      const mode = h.counts.indexOf(Math.max(...h.counts));
      return `<h3>Distribusi Fire Radiative Power (&lt; 200 MW)</h3>${histChart(h)}` +
             note(`Distribusi condong ke kanan: modus pada rentang ${h.edges[mode]}-${h.edges[mode + 1]} MW dan ekor panjang ke api besar. ` +
                  `${fmt(total)} titik &lt; 200 MW ditampilkan, ${fmt(h.di_atas_200)} titik lain ≥ 200 MW tidak digambar.`);
    },

    siangmalam(d) {
      clearMap();
      const rows = d.siangmalam;
      const sum = rows.reduce((a, r) => a + r.total, 0);
      const lines = rows.map((r) => `${r.kode === "D" ? "Siang" : "Malam"}: ${fmt(r.total)} titik (${fmt2((r.total / sum) * 100)}%), darurat ${fmt(r.darurat)}`);
      return `<h3>Perbandingan Kejadian: Siang (D) vs Malam (N)</h3>${barChart(rows)}` + note(lines.join(" &middot; "));
    },

    tren(d) {
      clearMap();
      const t = d.tren;
      return `<h3>Tren Jumlah Titik Panas Harian</h3>${lineChart(t)}` +
             note(`Puncak kebakaran: ${fmt(t.puncak.jumlah)} titik pada ${shortDate(t.puncak.tanggal)} (periode ${shortDate(t.tanggal[0])} - ${shortDate(t.tanggal[t.tanggal.length - 1])}).`);
    },

    top10(d) {
      clearMap(); markerLayer.clearLayers();
      drawPins(d.top10, "red");
      const rows = d.top10.map((r, i) => [i + 1, r.acq_date, r.lokasi ? escapeHtml(r.lokasi) : "-", r.latitude, r.longitude, fmt2(r.frp)]);
      return `<h3>Top 10 Lokasi Prioritas Pemadaman</h3>${table(["#", "Tanggal", "Lokasi", "Lat", "Lon", "FRP (MW)"], rows)}` +
             note("Diurutkan dari FRP tertinggi (status DARURAT). Nama lokasi muncul bila data dibuat dengan opsi --geocode.");
    },

    aman10(d) {
      clearMap(); markerLayer.clearLayers();
      drawPins(d.aman10, "green");
      const rows = d.aman10.map((r, i) => [i + 1, r.acq_date, r.lokasi ? escapeHtml(r.lokasi) : "-", r.latitude, r.longitude, fmt2(r.frp)]);
      return `<h3>Sampel 10 Lokasi Terkendali (Aman)</h3>${table(["#", "Tanggal", "Lokasi", "Lat", "Lon", "FRP (MW)"], rows)}` +
             note("Titik dengan FRP terendah (≤ 30 MW) sebagai contoh wilayah terkendali.");
    },
  };

  /* ---------------- kontrol ---------------- */
  async function show() {
    const err = $("eda-error"), out = $("eda-output");
    showError(err, "");
    setBusy(true, "Memuat data EDA...");
    try {
      const data = await loadEda();
      const key = $("eda-select").value;
      out.innerHTML = R[key](data);
      setStatus(`EDA: ${$("eda-select").selectedOptions[0].textContent.replace(/^\d+\.\s*/, "")}`);
    } catch (e) {
      out.innerHTML = "";
      showError(err, e.message);
      setStatus("EDA gagal dimuat");
    } finally {
      setBusy(false);
    }
  }

  $("eda-select").addEventListener("change", show);

  // Muat saat tab EDA dibuka; bersihkan lapisan EDA saat pindah tab lain.
  function onTabChange(name) {
    if (name === "eda") show();
    else clearMap();
  }
  document.querySelectorAll(".tab").forEach((t) =>
    t.addEventListener("click", () => onTabChange(t.dataset.tab)));
  document.querySelectorAll("[data-action^='tab-']").forEach((el) =>
    el.addEventListener("click", () => onTabChange(el.dataset.action.slice(4))));
})();
```

---

## 7. Cara Pakai dan Deploy ke Vercel

```bash
# 1. Buat data EDA dari CSV asli (menghasilkan api/eda_data.json)
python model/eda_generate.py model/fire_nrt_M-C61_825606.csv

# Opsional: tambah nama daerah untuk Top 10 (butuh internet, pip install geopy, ± 1 detik per titik)
python model/eda_generate.py model/fire_nrt_M-C61_825606.csv --geocode

# 2. Jalankan lokal
python api/index.py          # buka http://localhost:5000 lalu klik tab EDA
```

Untuk Vercel:

1. Pastikan **`api/eda_data.json` ikut di-commit/terunggah**, sama seperti `model_karhutla_NB.pkl` (ukurannya sekitar 90 KB).
2. `eda.js` berada di `public/`, jadi dilayani otomatis sebagai file statis. `vercel.json` tidak perlu diubah.
3. Setelah deploy, cek `https://<domain-anda>/api/eda?section=ringkasan`. Bila muncul JSON, fitur siap dipakai.
4. Bila API membalas 503 "Data EDA belum tersedia" padahal file sudah ada di repositori, kemungkinan file tidak ikut terbundel ke fungsi. Coba tambahkan pada `vercel.json`:

```json
{
  "functions": { "api/index.py": { "includeFiles": "api/*.json" } },
  "rewrites": [ { "source": "/api/(.*)", "destination": "/api/index" } ]
}
```

Bila data diperbarui (misalnya CSV FIRMS terbaru), jalankan ulang `eda_generate.py`, lalu commit `eda_data.json` yang baru.

---

## 8. Dokumentasi API EDA

### `GET /api/eda`

Mengembalikan seluruh data EDA (header `Cache-Control: public, max-age=3600`).

### `GET /api/eda?section=<nama>`

Hanya satu bagian. Nilai `section`: `ringkasan`, `head5`, `sebaran`, `heatmap`, `frp`, `siangmalam`, `tren`, `top10`, `aman10`.

**Contoh respons `section=tren`**

```json
{
  "tren": {
    "tanggal": ["2026-08-01", "2026-08-02", "..."],
    "jumlah": [75, 25, "..."],
    "puncak": { "tanggal": "2026-08-29", "jumlah": 1704 }
  }
}
```

> Contoh di atas hanya memperlihatkan bentuk data; nilai pasti ditentukan oleh CSV Anda. Puncak 1.704 titik pada 29 Agustus berasal dari grafik notebook.

**Struktur ringkas setiap bagian**

| Bagian | Isi |
|---|---|
| `ringkasan` | total mentah, total Kalimantan, jumlah dan persen darurat/aman, rentang tanggal, statistik `frp`, `brightness`, `confidence` (mean, median, min, max) |
| `head5` | 5 baris pertama dengan kolom: latitude, longitude, brightness, acq_date, acq_time, confidence, frp, daynight |
| `sebaran` | `points`: `[lat, lon, risiko]` (maks. 1.500 per kelas), `dikirim`, `total` |
| `heatmap` | `grid` (0,25°), `max`, `cells`: `[lat, lon, jumlah]` |
| `frp` | `counts` (50 bin), `edges`, `di_atas_200`, `threshold` |
| `siangmalam` | daftar `{kode, total, darurat}` untuk D dan N |
| `tren` | `tanggal`, `jumlah`, `puncak` |
| `top10`, `aman10` | `acq_date`, `latitude`, `longitude`, `brightness`, `frp`, `confidence`, dan `lokasi` (bila `--geocode`) |

Kode status: `200` sukses, `404` section tidak dikenal (respons berisi daftar yang tersedia), `503` file `eda_data.json` belum ada.

---

## 9. Catatan dan Keterbatasan

1. **Data EDA bersifat snapshot.** Isinya statis sampai `eda_generate.py` dijalankan ulang; bukan pemantauan real-time.
2. **Heatmap memakai histogram 2D** (sel 0,25°), bukan KDE seperti `sns.kdeplot` di notebook. Pola klasternya serupa, tetapi tampilan lebih berpetak dan jumlah per sel bisa dibaca lewat tooltip.
3. **Peta sebaran memakai sampel** (maks. 1.500 titik per kelas) agar JSON dan peta tetap ringan. Jumlah total tetap ditampilkan di catatan grafik.
4. **Distribusi FRP hanya menggambar titik < 200 MW**, sama seperti notebook. Jumlah titik ≥ 200 MW dilaporkan terpisah. Garis putus-putus ambang 30 MW adalah tambahan visual (tidak ada di notebook) agar kaitannya dengan label DARURAT terlihat.
5. **Nama daerah** pada Top 10 memakai Nominatim (OpenStreetMap) dan dibatasi 1 permintaan per detik; hasilnya bisa berbeda tingkat detail (misalnya muncul kode pos). Tanpa `--geocode`, kolom lokasi bernilai "-".
6. **Siang vs malam** perlu dibaca hati-hati: selisih jumlah deteksi tidak otomatis berarti kebakaran lebih sering terjadi pada malam hari, karena jadwal lintasan satelit dan kemudahan deteksi ikut berpengaruh.
7. **Pengujian.** Fitur ini sudah saya jalankan end-to-end memakai data sintetis (pembuat data, endpoint, dan kedelapan tampilan EDA tampil tanpa error JavaScript). Karena CSV asli tidak tersedia di sini, angka hasil asli belum bisa saya hasilkan; bagian 2 dokumen ini berasal dari output notebook Anda.

---

*Dokumen ini melengkapi `Klasifikasi_Wilayah_Pemadaman_Karhutla_Kalimantan.md` dan disusun dari notebook `Karhutla2.ipynb`.*
