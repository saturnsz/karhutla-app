# Klasifikasi Wilayah Pemadaman Karhutla di Kalimantan Menggunakan Algoritma Machine Learning

Sistem klasifikasi titik panas (hotspot) di Pulau Kalimantan untuk menentukan **prioritas pemadaman karhutla**: `DARURAT (Prioritas Pemadaman)` atau `AMAN (Terkendali)`. Sistem terdiri dari:

| Komponen | Teknologi |
|---|---|
| Pelatihan model | Python, pandas, scikit-learn, joblib (`.pkl`) |
| Backend / REST API | Python + Flask |
| Frontend | HTML, CSS, JavaScript (Leaflet untuk peta), tema Windows XP |
| Deployment | Vercel (opsional) |

> Dokumen ini disusun dari notebook `Karhutla2.ipynb` dan berisi seluruh kode yang dibutuhkan untuk menjalankan sistem dari awal sampai akhir.

---

## Daftar Isi

1. [Latar Belakang dan Tujuan](#1-latar-belakang-dan-tujuan)
2. [Ringkasan Notebook (Metodologi dan Hasil)](#2-ringkasan-notebook-metodologi-dan-hasil)
3. [Arsitektur Sistem](#3-arsitektur-sistem)
4. [Struktur Folder](#4-struktur-folder)
5. [Langkah 1 - Training Model dan Membuat File .pkl](#5-langkah-1---training-model-dan-membuat-file-pkl)
6. [Langkah 2 - Backend API (Python Flask)](#6-langkah-2---backend-api-python-flask)
7. [Langkah 3 - Frontend (HTML, CSS, JS) - Tema Windows XP](#7-langkah-3---frontend-html-css-js---tema-windows-xp)
8. [Menjalankan Secara Lokal](#8-menjalankan-secara-lokal)
9. [Deploy ke Vercel](#9-deploy-ke-vercel)
10. [Dokumentasi API](#10-dokumentasi-api)
11. [Catatan dan Keterbatasan](#11-catatan-dan-keterbatasan)

---

## 1. Latar Belakang dan Tujuan

Kebakaran hutan dan lahan (karhutla) di Kalimantan terjadi berulang, terutama pada musim kemarau. Sumber daya pemadaman terbatas, sehingga titik api perlu **diprioritaskan**. Sistem ini memanfaatkan data titik panas satelit **NASA FIRMS (MODIS C6.1 NRT)** untuk mengklasifikasikan setiap titik menjadi:

- **1 = DARURAT**: titik api besar (FRP > 30 MW), prioritas pemadaman.
- **0 = AMAN**: titik api kecil / terkendali, cukup dipantau rutin.

**Tujuan:**
1. Membandingkan tiga algoritma klasifikasi: Decision Tree, Logistic Regression, dan Naive Bayes.
2. Menyimpan model terbaik ke file `.pkl`.
3. Menyediakan REST API dan antarmuka web agar pengguna dapat memasukkan data titik panas dan langsung mendapat klasifikasinya.

---

## 2. Ringkasan Notebook (Metodologi dan Hasil)

### 2.1 Dataset

- Sumber: NASA FIRMS, file `fire_nrt_M-C61_825606.csv` (MODIS Collection 6.1 NRT, periode Agustus - Oktober 2026).
- Kolom utama: `latitude`, `longitude`, `brightness`, `scan`, `track`, `acq_date`, `acq_time`, `satellite`, `instrument`, `confidence`, `version`, `bright_t31`, `frp`, `daynight`.

### 2.2 Pra-pemrosesan

```python
# Filter wilayah Kalimantan (bounding box) dan confidence tinggi
df_kalimantan = df[
    (df['latitude'] >= -4.5) & (df['latitude'] <= 4.5) &
    (df['longitude'] >= 108.5) & (df['longitude'] <= 119.5)
].copy()
df_kalimantan = df_kalimantan[df_kalimantan['confidence'] >= 80].copy()

# Pelabelan: FRP > 30 MW = Darurat (1), selain itu Aman (0)
df_kalimantan['target_risk'] = np.where(df_kalimantan['frp'] > 30, 1, 0)
```

- **Fitur (X):** `latitude`, `longitude`, `brightness`, `confidence`
- **Target (y):** `target_risk` (0 = Aman, 1 = Darurat)
- **Pembagian data:** 70% latih, 30% uji (`random_state=42`)

### 2.3 Model yang dibandingkan

| Model | Konfigurasi |
|---|---|
| Decision Tree (DT) | `max_depth=5, random_state=42` |
| Logistic Regression (MLR) | `max_iter=1000, random_state=42` |
| Naive Bayes (NB) | `GaussianNB()` |

### 2.4 Hasil evaluasi (dari output notebook)

| Model | Accuracy (%) | SST/Recall (%) | SPF (%) | Kappa | RMSE | AUC |
|---|---|---|---|---|---|---|
| Decision Tree (DT) | 82.09 | 70.53 | 94.79 | 0.645 | 0.351 | 0.888 |
| Logistic Regression (MLR) | 81.19 | 79.45 | 83.09 | 0.624 | 0.361 | 0.888 |
| **Naive Bayes (NB)** | **82.74** | 73.72 | 92.66 | **0.657** | 0.355 | 0.884 |

Metrik lanjutan:

| Model | Precision (%) | Recall/SST (%) | F1-Score (%) | AP/mAP (%) |
|---|---|---|---|---|
| Decision Tree (DT) | 93.70 | 70.53 | 80.48 | 91.52 |
| Logistic Regression (MLR) | 83.78 | 79.45 | 81.56 | 92.42 |
| Naive Bayes (NB) | 91.70 | 73.72 | 81.73 | 92.22 |

**Model terbaik: Naive Bayes** (akurasi dan Kappa tertinggi, ukuran file `.pkl` sangat kecil sehingga ringan untuk Vercel). Disimpan sebagai `model_karhutla_NB.pkl`.

### 2.5 Visualisasi yang dihasilkan notebook

- Tabel 5 baris pertama dataset (PNG 300 DPI)
- Diagram batang perbandingan Accuracy dan SST
- Peta sebaran titik panas (risiko rendah vs tinggi)
- Heatmap kepadatan titik panas (KDE)
- Histogram distribusi FRP, perbandingan siang vs malam
- Tren jumlah titik panas harian
- Magnitude of error (training vs validation) dan kurva ROC
- Confusion matrix tiga model
- Peta Top 10 lokasi prioritas pemadaman

### 2.6 Top 10 lokasi prioritas pemadaman (reverse geocoding)

| Tanggal | Lokasi | Lat | Lon | FRP (MW) |
|---|---|---|---|---|
| 2026-10-11 | Kendawangan, Ketapang, Kalimantan Barat | -2.79958 | 110.69582 | 2488.53 |
| 2026-08-22 | Matan Hilir Selatan, Ketapang, Kalimantan Barat | -1.83287 | 110.19039 | 1705.29 |
| 2026-09-01 | Ketapang, Kalimantan Barat | -1.75217 | 110.16258 | 1621.93 |
| 2026-10-11 | Kendawangan, Ketapang, Kalimantan Barat | -2.79026 | 110.70202 | 1488.04 |
| 2026-09-18 | Kotawaringin Barat, Kalimantan Tengah | -2.50896 | 111.55318 | 1329.51 |
| 2026-10-18 | Matan Hilir Selatan, Ketapang, Kalimantan Barat | -1.88880 | 110.17416 | 1280.01 |
| 2026-09-11 | Pangkalan Bun, Kotawaringin Barat, Kalimantan Tengah | -2.59592 | 111.57973 | 1204.23 |
| 2026-09-01 | Pulang Pisau, Kalimantan Tengah | -3.22113 | 113.76171 | 1167.85 |
| 2026-09-22 | Kotabaru, Kalimantan Selatan | -3.76800 | 116.16291 | 1012.73 |
| 2026-08-28 | Kapuas, Kalimantan Tengah | -2.02030 | 114.15190 | 922.67 |

### 2.7 Uji skenario dari notebook

| Skenario | Input (lat, lon, brightness, confidence) | Hasil |
|---|---|---|
| Palangkaraya, kondisi panas ekstrem | -2.20, 113.91, 350.5, 100 | **DARURAT** (probabilitas 99,99%) |
| Pontianak, api kecil | -0.02, 109.33, 310.2, 82 | **AMAN** (probabilitas 92,18%) |

Dua skenario ini dipakai juga sebagai tombol contoh di frontend.

---

## 3. Arsitektur Sistem

```
+-------------------+      HTTP / JSON       +---------------------------+
|  Frontend         |  ------------------->  |  Backend (Flask)          |
|  HTML + CSS + JS  |  POST /api/predict     |  api/index.py             |
|  Leaflet (peta)   |  <-------------------  |   - validasi input        |
+-------------------+   hasil klasifikasi    |   - joblib.load(.pkl)     |
                                             |   - predict + proba       |
                                             +------------+--------------+
                                                          |
                                             +------------v--------------+
                                             |  model_karhutla_NB.pkl    |
                                             |  (GaussianNB, 4 fitur)    |
                                             +---------------------------+
```

Alur: pengguna (lewat antarmuka bertema Windows XP) mengisi koordinat, brightness, dan confidence (atau klik peta) -> frontend memanggil `POST /api/predict` -> backend memvalidasi input, memuat model, menghitung kelas dan probabilitas -> frontend menampilkan status, rekomendasi tindakan, dan marker di peta.

---

## 4. Struktur Folder

```
karhutla-app/
├── api/
│   ├── index.py                  # Backend Flask (REST API)
│   ├── model_karhutla_NB.pkl     # Model hasil training (dibuat oleh train_model.py)
│   └── model_info.json           # Metrik evaluasi (dibuat oleh train_model.py)
├── model/
│   ├── train_model.py            # Script training dari notebook
│   └── fire_nrt_M-C61_825606.csv # Dataset NASA FIRMS (taruh sendiri)
├── public/
│   ├── index.html                # Frontend: struktur halaman
│   ├── style.css                 # Frontend: tampilan
│   └── script.js                 # Frontend: logika + pemanggilan API
├── requirements.txt
├── vercel.json                   # Konfigurasi routing Vercel
├── .vercelignore                 # File yang tidak ikut diunggah ke Vercel
├── .python-version               # Versi Python di Vercel
└── .gitignore
```

---

## 5. Langkah 1 - Training Model dan Membuat File .pkl

File `.pkl` tidak ikut dibuat otomatis dari dokumen ini karena dibutuhkan dataset CSV asli. Jalankan script di bawah (isinya sama dengan logika notebook) untuk menghasilkan `model_karhutla_NB.pkl` dan `model_info.json`.

**`model/train_model.py`**

```python
"""
Training model klasifikasi wilayah pemadaman karhutla Kalimantan.
Logika sama dengan notebook Karhutla2.ipynb.

Pemakaian:
    python model/train_model.py model/fire_nrt_M-C61_825606.csv
"""
import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (accuracy_score, average_precision_score,
                             cohen_kappa_score, confusion_matrix, f1_score,
                             mean_squared_error, precision_score,
                             roc_auc_score)
from sklearn.model_selection import train_test_split
from sklearn.naive_bayes import GaussianNB
from sklearn.tree import DecisionTreeClassifier

FEATURES = ["latitude", "longitude", "brightness", "confidence"]
FRP_THRESHOLD = 30      # MW, di atas ini = DARURAT
OUT_DIR = Path(__file__).resolve().parent.parent / "api"


def load_data(csv_path: str) -> pd.DataFrame:
    df = pd.read_csv(csv_path)

    # Filter Kalimantan + confidence tinggi
    df = df[
        (df["latitude"] >= -4.5) & (df["latitude"] <= 4.5) &
        (df["longitude"] >= 108.5) & (df["longitude"] <= 119.5)
    ].copy()
    df = df[df["confidence"] >= 80].copy()

    # Label: 1 = Darurat, 0 = Aman
    df["target_risk"] = np.where(df["frp"] > FRP_THRESHOLD, 1, 0)
    return df


def main(csv_path: str) -> None:
    df = load_data(csv_path)
    X, y = df[FEATURES], df["target_risk"]
    print(f"Jumlah data: {len(df)} | Darurat: {int(y.sum())} | Aman: {int((y == 0).sum())}")

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.3, random_state=42
    )

    models = {
        "Decision Tree (DT)": DecisionTreeClassifier(max_depth=5, random_state=42),
        "Logistic Regression (MLR)": LogisticRegression(max_iter=1000, random_state=42),
        "Naive Bayes (NB)": GaussianNB(),
    }

    results = []
    for name, model in models.items():
        model.fit(X_train, y_train)
        y_pred = model.predict(X_test)
        y_prob = model.predict_proba(X_test)[:, 1]

        tn, fp, fn, tp = confusion_matrix(y_test, y_pred).ravel()
        results.append({
            "model": name,
            "accuracy": round(accuracy_score(y_test, y_pred) * 100, 2),
            "sensitivity": round(tp / (tp + fn) * 100, 2),
            "specificity": round(tn / (tn + fp) * 100, 2),
            "precision": round(precision_score(y_test, y_pred) * 100, 2),
            "f1": round(f1_score(y_test, y_pred) * 100, 2),
            "kappa": round(cohen_kappa_score(y_test, y_pred), 3),
            "rmse": round(float(np.sqrt(mean_squared_error(y_test, y_prob))), 3),
            "auc": round(roc_auc_score(y_test, y_prob), 3),
            "ap": round(average_precision_score(y_test, y_prob) * 100, 2),
        })

    print(pd.DataFrame(results).to_string(index=False))

    # Model terbaik untuk deployment: Naive Bayes (ringan, akurasi & kappa tertinggi di notebook)
    best_model = GaussianNB()
    best_model.fit(X_train, y_train)

    OUT_DIR.mkdir(exist_ok=True)
    joblib.dump(best_model, OUT_DIR / "model_karhutla_NB.pkl")

    info = {
        "model_name": "Gaussian Naive Bayes",
        "features": FEATURES,
        "classes": {"0": "AMAN", "1": "DARURAT"},
        "frp_threshold_mw": FRP_THRESHOLD,
        "train_size": int(len(X_train)),
        "test_size": int(len(X_test)),
        "comparison": results,
    }
    with open(OUT_DIR / "model_info.json", "w", encoding="utf-8") as f:
        json.dump(info, f, indent=2, ensure_ascii=False)

    print(f"\nModel tersimpan: {OUT_DIR / 'model_karhutla_NB.pkl'}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("Pemakaian: python model/train_model.py <path_csv>")
    main(sys.argv[1])
```

Jika memakai Google Colab langsung dari notebook, cukup jalankan sel penyimpanan model (`joblib.dump(best_model, 'model_karhutla_NB.pkl')`), lalu unduh file `.pkl` dan letakkan di folder `api/`.

---

## 6. Langkah 2 - Backend API (Python Flask)

**`requirements.txt`**

```
flask==3.0.3
flask-cors==4.0.1
pandas==2.2.2
numpy==1.26.4
scikit-learn==1.5.1
joblib==1.4.2
```

> Penting: versi `scikit-learn` saat training dan saat deploy sebaiknya sama agar file `.pkl` dapat dimuat tanpa peringatan. Samakan versi di atas dengan versi di lingkungan tempat Anda menjalankan `train_model.py` (`pip show scikit-learn`).

**`api/index.py`**

```python
"""
Backend REST API - Klasifikasi Wilayah Pemadaman Karhutla Kalimantan.

Endpoint:
    GET  /api/health
    GET  /api/model-info
    POST /api/predict          -> 1 titik
    POST /api/predict-batch    -> banyak titik (maks. 500)
"""
import json
from pathlib import Path

import joblib
import pandas as pd
from flask import Flask, jsonify, request
from flask_cors import CORS

BASE_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = BASE_DIR.parent / "public"

app = Flask(__name__, static_folder=str(PUBLIC_DIR), static_url_path="")
CORS(app)

# ---------------------------------------------------------------- model
MODEL_PATH = BASE_DIR / "model_karhutla_NB.pkl"
MODEL = joblib.load(MODEL_PATH) if MODEL_PATH.exists() else None
FEATURES = ["latitude", "longitude", "brightness", "confidence"]

MODEL_INFO = {}
_info_path = BASE_DIR / "model_info.json"
if _info_path.exists():
    MODEL_INFO = json.loads(_info_path.read_text(encoding="utf-8"))

# Batas validasi (sesuai data latih di notebook)
LIMITS = {
    "latitude":   (-4.5, 4.5),      # bounding box Kalimantan
    "longitude":  (108.5, 119.5),
    "brightness": (250.0, 520.0),   # Kelvin, kisaran wajar MODIS
    "confidence": (80.0, 100.0),    # model dilatih hanya pada confidence >= 80
}
MAX_BATCH = 500


# ---------------------------------------------------------------- helper
def validate_point(data):
    """Mengembalikan (nilai_bersih, daftar_error)."""
    clean, errors = {}, []
    if not isinstance(data, dict):
        return None, ["Data titik harus berupa objek JSON."]

    for field in FEATURES:
        if field not in data:
            errors.append(f"Field '{field}' wajib diisi.")
            continue
        try:
            value = float(data[field])
        except (TypeError, ValueError):
            errors.append(f"Field '{field}' harus berupa angka.")
            continue

        low, high = LIMITS[field]
        if not (low <= value <= high):
            errors.append(f"Field '{field}' harus di antara {low} dan {high}.")
            continue
        clean[field] = value
    return clean, errors


def build_result(point, proba_darurat):
    """Menyusun respons klasifikasi untuk satu titik."""
    is_darurat = proba_darurat >= 0.5
    confidence_pct = (proba_darurat if is_darurat else 1 - proba_darurat) * 100

    if is_darurat:
        status, label = "DARURAT", 1
        action = "Segera kerahkan unit pemadam ke lokasi (prioritas pemadaman)."
        potential = "Potensi kebakaran masif dan asap tebal."
    else:
        status, label = "AMAN", 0
        action = "Masukkan ke daftar pantauan satelit rutin."
        potential = "Api kecil, kemungkinan pembakaran lahan lokal."

    return {
        "input": point,
        "label": label,
        "status": status,
        "keyakinan_persen": round(confidence_pct, 2),
        "probabilitas": {
            "aman": round((1 - proba_darurat) * 100, 2),
            "darurat": round(proba_darurat * 100, 2),
        },
        "tindakan": action,
        "potensi": potential,
    }


def predict_points(points):
    df = pd.DataFrame(points, columns=FEATURES)
    probs = MODEL.predict_proba(df)[:, 1]
    return [build_result(p, float(pr)) for p, pr in zip(points, probs)]


# ---------------------------------------------------------------- routes
@app.get("/")
def index():
    # Hanya dipakai saat lokal; di Vercel folder public/ dilayani otomatis.
    return app.send_static_file("index.html")


@app.before_request
def require_model():
    if request.method == "POST" and MODEL is None:
        return jsonify({"error": "Model belum tersedia. Letakkan model_karhutla_NB.pkl di folder api/ lalu deploy ulang."}), 503


@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "model_loaded": MODEL is not None})


@app.get("/api/model-info")
def model_info():
    return jsonify({"features": FEATURES, "limits": LIMITS, **MODEL_INFO})


@app.post("/api/predict")
def predict():
    payload = request.get_json(silent=True)
    point, errors = validate_point(payload)
    if errors:
        return jsonify({"error": "Input tidak valid", "detail": errors}), 400
    return jsonify(predict_points([point])[0])


@app.post("/api/predict-batch")
def predict_batch():
    payload = request.get_json(silent=True)
    items = payload.get("points") if isinstance(payload, dict) else None
    if not isinstance(items, list) or not items:
        return jsonify({"error": "Kirim JSON {\"points\": [ ... ]} berisi minimal 1 titik."}), 400
    if len(items) > MAX_BATCH:
        return jsonify({"error": f"Maksimal {MAX_BATCH} titik per permintaan."}), 400

    valid_points, results, skipped = [], [], []
    for i, item in enumerate(items):
        point, errors = validate_point(item)
        if errors:
            skipped.append({"baris": i + 1, "detail": errors})
        else:
            valid_points.append(point)

    if valid_points:
        results = predict_points(valid_points)
        results.sort(key=lambda r: r["probabilitas"]["darurat"], reverse=True)

    return jsonify({
        "total_dikirim": len(items),
        "total_diproses": len(valid_points),
        "total_darurat": sum(r["label"] == 1 for r in results),
        "total_aman": sum(r["label"] == 0 for r in results),
        "dilewati": skipped,
        "hasil": results,
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
```

---

## 7. Langkah 3 - Frontend (HTML, CSS, JS) - Tema Windows XP

Antarmuka dirancang menyerupai **Windows XP (tema Luna Blue)**: desktop bernuansa "Bliss", jendela dengan title bar biru, menu bar, tab, group box, tombol bergaya XP, kotak pesan, progress bar hijau, status bar, taskbar dengan tombol **start**, Start Menu, dan jam di system tray. Semua elemen digambar murni dengan CSS (tanpa gambar eksternal), jadi ringan dan aman untuk Vercel.

### 7.0 Desain layout

**Wireframe (desktop)**

```
+--------------------------------------------------------------------------+
| [🔥] Klasifikasi Wilayah Pemadaman Karhutla di Kalimantan     [_] [□] [X] |  <- Title bar (biru Luna)
+--------------------------------------------------------------------------+
| Berkas   Lihat   Bantuan                                                 |  <- Menu bar + dropdown
+--------------------------------------------------------------------------+
| [🌲] Masukkan data titik panas satelit ... DARURAT atau AMAN             |  <- Banner informasi
+------------------------------------------+-------------------------------+
| [Tunggal][CSV][Riwayat][Model]           |  +-- Peta Kalimantan -------+ |
| +--------------------------------------+ |  |                          | |
| | +-- Koordinat -------------------+   | |  |   Peta Leaflet           | |
| | | Latitude      Longitude        |   | |  |   (klik = isi koordinat) | |
| | +--------------------------------+   | |  |   marker merah/hijau     | |
| | +-- Data Sensor Satelit ---------+   | |  |                          | |
| | | Brightness    Confidence       |   | |  |                          | |
| | +--------------------------------+   | |  +--------------------------+ |
| | [Klasifikasikan] [Contoh ...]        | |  ● Darurat ● Aman ▭ Batas     |
| | +-- Hasil Klasifikasi (msgbox) ---+  | |                               |
| | | (!) DARURAT  ||||||||||||||||    |  | |                               |
| | +---------------------------------+  | |                               |
| +--------------------------------------+ |                               |
+------------------------------------------+-------------------------------+
| Siap                          [▮▮▮ progress]            API: online      |  <- Status bar
+--------------------------------------------------------------------------+
| [start] [🔥 Klasifikasi Karhutla]                         [🛰️ 08.01]    |  <- Taskbar
+--------------------------------------------------------------------------+
```

**Pemetaan elemen XP ke fitur sistem**

| Elemen UI Windows XP | Fungsi di aplikasi |
|---|---|
| Jendela + title bar | Wadah aplikasi; tombol minimize, maximize, dan close berfungsi |
| Menu bar (Berkas, Lihat, Bantuan) | Pintasan: contoh data, unduh CSV, hapus riwayat, pindah tab, tentang aplikasi |
| Tab control | Tunggal, CSV, Riwayat, Model |
| Group box (fieldset) | Pengelompokan input koordinat dan data sensor |
| Tombol XP | Klasifikasikan, contoh Palangkaraya/Pontianak, proses CSV |
| Message box | Hasil klasifikasi (merah = DARURAT, hijau = AMAN) |
| Progress bar hijau | Indikator saat memanggil API; juga meter probabilitas |
| List view | Tabel hasil CSV, riwayat, dan perbandingan model |
| Status bar | Pesan status dan indikator API online/offline |
| Taskbar + Start Menu + jam | Navigasi cepat antar fitur, restore jendela yang diminimalkan |
| Dialog | Tentang aplikasi dan pesan sistem |

**Palet warna Luna Blue**

| Peran | Warna |
|---|---|
| Title bar | gradasi `#0997ff` - `#0053ee` - `#0066ff` - `#003dd7` |
| Border jendela | `#0831d9` |
| Permukaan jendela | `#ece9d8` |
| Taskbar | gradasi `#245edc` - `#3f8cf3` |
| Tombol start | gradasi hijau `#5fb957` - `#2f8a22` |
| Seleksi (hover menu/baris) | `#316ac5` |
| Darurat / Aman | `#cc2200` / `#2f8a1f` |

**Responsif:** pada layar lebar peta berada di kanan; pada layar kecil (<= 900 px) susunan menjadi satu kolom dan jendela memenuhi lebar layar. Font: Tahoma (cadangan Segoe UI, Verdana), judul memakai Trebuchet MS.

### 7.1 `public/index.html`

```html
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Klasifikasi Wilayah Pemadaman Karhutla Kalimantan</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <div class="desktop">

    <!-- ================= JENDELA UTAMA ================= -->
    <section class="window" id="main-window" aria-labelledby="win-title">
      <header class="titlebar">
        <span class="title-icon" aria-hidden="true">🔥</span>
        <h1 id="win-title">Klasifikasi Wilayah Pemadaman Karhutla di Kalimantan</h1>
        <div class="controls">
          <button type="button" class="ctl ctl-min" id="btn-min" aria-label="Minimalkan"></button>
          <button type="button" class="ctl ctl-max" id="btn-max" aria-label="Maksimalkan"></button>
          <button type="button" class="ctl ctl-close" id="btn-close" aria-label="Tutup">&#10005;</button>
        </div>
      </header>

      <nav class="menubar" aria-label="Menu aplikasi">
        <div class="menu">
          <button type="button" data-menu="m-berkas">Berkas</button>
          <ul class="dropdown" id="m-berkas" hidden>
            <li><button type="button" data-action="preset-palangkaraya">Contoh: Palangkaraya</button></li>
            <li><button type="button" data-action="preset-pontianak">Contoh: Pontianak</button></li>
            <li><button type="button" data-action="sample-csv">Unduh contoh CSV</button></li>
            <li class="sep"></li>
            <li><button type="button" data-action="clear-history">Hapus riwayat</button></li>
            <li class="sep"></li>
            <li><button type="button" data-action="exit">Keluar</button></li>
          </ul>
        </div>
        <div class="menu">
          <button type="button" data-menu="m-lihat">Lihat</button>
          <ul class="dropdown" id="m-lihat" hidden>
            <li><button type="button" data-action="tab-single">Klasifikasi Tunggal</button></li>
            <li><button type="button" data-action="tab-batch">Klasifikasi CSV</button></li>
            <li><button type="button" data-action="tab-history">Riwayat</button></li>
            <li><button type="button" data-action="tab-model">Informasi Model</button></li>
          </ul>
        </div>
        <div class="menu">
          <button type="button" data-menu="m-bantuan">Bantuan</button>
          <ul class="dropdown" id="m-bantuan" hidden>
            <li><button type="button" data-action="about">Tentang Aplikasi ini</button></li>
          </ul>
        </div>
      </nav>

      <div class="banner">
        <div class="banner-icon" aria-hidden="true">🌲</div>
        <p>
          Masukkan data titik panas satelit <strong>NASA FIRMS (MODIS)</strong> untuk mengetahui apakah wilayah
          berstatus <strong class="t-red">DARURAT</strong> (prioritas pemadaman) atau
          <strong class="t-green">AMAN</strong> (terkendali).
        </p>
      </div>

      <div class="window-body">
        <!-- ======== KIRI: TAB ======== -->
        <div class="left">
          <div class="tabs" role="tablist">
            <button type="button" role="tab" class="tab active" data-tab="single" aria-selected="true">Tunggal</button>
            <button type="button" role="tab" class="tab" data-tab="batch" aria-selected="false">CSV</button>
            <button type="button" role="tab" class="tab" data-tab="history" aria-selected="false">Riwayat</button>
            <button type="button" role="tab" class="tab" data-tab="model" aria-selected="false">Model</button>
          </div>

          <div class="tab-panels">
            <!-- TAB: TUNGGAL -->
            <div class="panel" id="tab-single" role="tabpanel">
              <form id="predict-form" novalidate>
                <fieldset>
                  <legend>Koordinat</legend>
                  <div class="row">
                    <label>Latitude
                      <input type="number" id="latitude" step="any" min="-4.5" max="4.5" placeholder="-2.20" required />
                      <small>-4.5 s.d. 4.5</small>
                    </label>
                    <label>Longitude
                      <input type="number" id="longitude" step="any" min="108.5" max="119.5" placeholder="113.91" required />
                      <small>108.5 s.d. 119.5</small>
                    </label>
                  </div>
                </fieldset>

                <fieldset>
                  <legend>Data Sensor Satelit</legend>
                  <div class="row">
                    <label>Brightness (Kelvin)
                      <input type="number" id="brightness" step="any" min="250" max="520" placeholder="350.5" required />
                      <small>250 s.d. 520</small>
                    </label>
                    <label>Confidence (%)
                      <input type="number" id="confidence" step="any" min="80" max="100" placeholder="100" required />
                      <small>80 s.d. 100</small>
                    </label>
                  </div>
                </fieldset>

                <p id="form-error" class="inline-error" role="alert" hidden></p>

                <div class="btn-row">
                  <button type="submit" id="btn-predict" class="xp-btn default">Klasifikasikan</button>
                  <button type="button" class="xp-btn" data-preset="palangkaraya">Contoh Palangkaraya</button>
                  <button type="button" class="xp-btn" data-preset="pontianak">Contoh Pontianak</button>
                </div>
                <p class="hint">Tip: klik peta di sebelah kanan untuk mengisi latitude dan longitude.</p>
              </form>

              <div id="result" hidden aria-live="polite"></div>
            </div>

            <!-- TAB: CSV -->
            <div class="panel" id="tab-batch" role="tabpanel" hidden>
              <fieldset>
                <legend>Unggah Berkas CSV</legend>
                <p>Header wajib: <code>latitude,longitude,brightness,confidence</code> (maksimal 500 baris). Hasil diurutkan dari probabilitas darurat tertinggi.</p>
                <input type="file" id="csv-file" accept=".csv,text/csv" />
                <div class="btn-row">
                  <button type="button" id="btn-batch" class="xp-btn default">Proses CSV</button>
                  <button type="button" id="btn-sample" class="xp-btn">Unduh contoh CSV</button>
                </div>
              </fieldset>
              <p id="batch-error" class="inline-error" role="alert" hidden></p>
              <div id="batch-summary" class="summary" hidden></div>
              <div class="listview">
                <table id="batch-table" hidden>
                  <thead>
                    <tr><th>#</th><th>Lat</th><th>Lon</th><th>Brightness</th><th>Conf.</th><th>Status</th><th>P(Darurat)</th></tr>
                  </thead>
                  <tbody></tbody>
                </table>
              </div>
            </div>

            <!-- TAB: RIWAYAT -->
            <div class="panel" id="tab-history" role="tabpanel" hidden>
              <div class="btn-row top">
                <button type="button" id="btn-clear" class="xp-btn">Hapus riwayat</button>
              </div>
              <ul id="history" class="history"></ul>
              <p id="history-empty" class="hint">Belum ada riwayat klasifikasi.</p>
            </div>

            <!-- TAB: MODEL -->
            <div class="panel" id="tab-model" role="tabpanel" hidden>
              <div id="model-info" class="hint">Memuat informasi model...</div>
              <div class="listview">
                <table id="compare-table" hidden>
                  <thead>
                    <tr><th>Model</th><th>Acc (%)</th><th>SST (%)</th><th>SPF (%)</th><th>Kappa</th><th>RMSE</th><th>AUC</th></tr>
                  </thead>
                  <tbody></tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <!-- ======== KANAN: PETA ======== -->
        <div class="right">
          <fieldset class="map-box">
            <legend>Peta Kalimantan</legend>
            <div id="map"></div>
            <div class="legend">
              <span><i class="dot red"></i> Darurat</span>
              <span><i class="dot green"></i> Aman</span>
              <span><i class="dot dash"></i> Batas wilayah model</span>
            </div>
          </fieldset>
        </div>
      </div>

      <footer class="statusbar">
        <span class="cell grow" id="status-text">Siap</span>
        <span class="cell"><span class="progress" id="progress" hidden><i></i></span></span>
        <span class="cell" id="status-api">API: memeriksa...</span>
      </footer>
    </section>

    <!-- ================= START MENU ================= -->
    <div class="start-menu" id="start-menu" hidden>
      <div class="sm-head"><span class="avatar">👨‍🚒</span> Operator Pemadam</div>
      <ul class="sm-list">
        <li><button type="button" data-action="tab-single">🔥 Klasifikasi Tunggal</button></li>
        <li><button type="button" data-action="tab-batch">📄 Klasifikasi CSV</button></li>
        <li><button type="button" data-action="tab-history">🕘 Riwayat</button></li>
        <li><button type="button" data-action="tab-model">📊 Informasi Model</button></li>
        <li class="sep"></li>
        <li><button type="button" data-action="about">❓ Tentang Aplikasi</button></li>
      </ul>
      <div class="sm-foot"><button type="button" data-action="exit">⏻ Tutup Aplikasi</button></div>
    </div>

    <!-- ================= TASKBAR ================= -->
    <footer class="taskbar">
      <button type="button" class="start-btn" id="start-btn" aria-haspopup="true">
        <span class="flag" aria-hidden="true"></span><em>start</em>
      </button>
      <button type="button" class="task-btn active" id="task-btn">🔥 Klasifikasi Karhutla</button>
      <div class="tray"><span aria-hidden="true">🛰️</span> <time id="clock">--.--</time></div>
    </footer>

    <!-- ================= DIALOG ================= -->
    <div class="overlay" id="overlay" hidden>
      <div class="window dialog" role="alertdialog" aria-labelledby="dlg-title" aria-describedby="dlg-text">
        <header class="titlebar">
          <h1 id="dlg-title">Pesan</h1>
          <div class="controls"><button type="button" class="ctl ctl-close" id="dlg-x" aria-label="Tutup">&#10005;</button></div>
        </header>
        <div class="dlg-body">
          <span class="msg-icon info" id="dlg-icon" aria-hidden="true">i</span>
          <p id="dlg-text"></p>
        </div>
        <div class="btn-row center"><button type="button" class="xp-btn default" id="dlg-ok">OK</button></div>
      </div>
    </div>
  </div>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="script.js"></script>
</body>
</html>
```

### 7.2 `public/style.css`

```css
/* ============================================================
   Tema Windows XP (Luna Blue)
   ============================================================ */
:root {
  --xp-face: #ece9d8;
  --xp-white: #ffffff;
  --xp-border: #0831d9;
  --xp-text: #000000;
  --xp-link: #0046d5;
  --xp-red: #cc2200;
  --xp-green: #2f8a1f;
  --xp-sunken: #7f9db9;
  --xp-select: #316ac5;
  --taskbar-h: 32px;
  --font: Tahoma, "Segoe UI", Verdana, Geneva, sans-serif;
  --font-title: "Trebuchet MS", Tahoma, "Segoe UI", sans-serif;
}

* { box-sizing: border-box; }
html, body { height: 100%; margin: 0; }

body {
  font: 13px/1.45 var(--font);
  color: var(--xp-text);
  overflow: hidden;
}

/* ---------- Desktop (nuansa "Bliss") ---------- */
.desktop {
  position: relative;
  height: 100%;
  padding: 14px 14px calc(var(--taskbar-h) + 14px);
  background:
    radial-gradient(ellipse 130% 48% at 22% 112%, #5aa72a 0 62%, transparent 62.4%),
    radial-gradient(ellipse 100% 40% at 92% 118%, #3f8f1c 0 62%, transparent 62.4%),
    linear-gradient(180deg, #1f5fcf 0%, #4e97ec 45%, #9fcdf6 72%, #d6ebfb 100%);
  display: flex;
  justify-content: center;
  align-items: flex-start;
  overflow: auto;
}

/* ---------- Window ---------- */
.window {
  width: min(1120px, 100%);
  background: var(--xp-face);
  border: 3px solid var(--xp-border);
  border-top: 0;
  border-radius: 9px 9px 3px 3px;
  box-shadow: 3px 4px 14px rgba(0, 0, 0, .45);
  display: flex;
  flex-direction: column;
}
.window.maximized {
  position: fixed; inset: 0 0 var(--taskbar-h) 0;
  width: auto; border-radius: 0; z-index: 5;
}
.window.minimized { display: none; }

.titlebar {
  display: flex; align-items: center; gap: 6px;
  min-height: 30px; padding: 3px 5px 3px 8px;
  border-radius: 7px 7px 0 0;
  background: linear-gradient(180deg,
    #0997ff 0%, #0053ee 8%, #0050ee 40%, #0066ff 88%, #0066ff 93%,
    #005bff 95%, #003dd7 96%, #003dd7 100%);
  color: #fff;
  text-shadow: 1px 1px #0f1089;
  user-select: none;
}
.titlebar h1 {
  flex: 1; margin: 0; min-width: 0;
  font: bold 14px var(--font-title);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.title-icon { font-size: 16px; }
.controls { display: flex; gap: 2px; }

.ctl {
  position: relative;
  width: 22px; height: 22px; padding: 0;
  border: 1px solid #fff; border-radius: 3px;
  color: #fff; font: bold 12px var(--font);
  background: radial-gradient(circle at 30% 25%, #6fa0ff, #2a62e8 55%, #1d4fd0);
  cursor: pointer; line-height: 1;
}
.ctl:hover { filter: brightness(1.12); }
.ctl:active { filter: brightness(.9); }
.ctl-close { background: radial-gradient(circle at 30% 25%, #f59a80, #e0482a 55%, #c03312); }
.ctl-min::after {
  content: ""; position: absolute; left: 5px; bottom: 5px;
  width: 8px; height: 3px; background: #fff;
}
.ctl-max::after {
  content: ""; position: absolute; left: 5px; top: 5px;
  width: 10px; height: 10px; border: 1px solid #fff; border-top-width: 3px;
}

/* ---------- Menu bar ---------- */
.menubar {
  display: flex; gap: 2px; padding: 2px 4px;
  background: var(--xp-face);
  border-bottom: 1px solid #d4d0c8;
  position: relative; z-index: 20;
}
.menu { position: relative; }
.menu > button {
  background: none; border: 0; padding: 3px 9px;
  font: 13px var(--font); cursor: default;
}
.menu > button:hover, .menu > button.open { background: var(--xp-select); color: #fff; }

.dropdown, .sm-list {
  list-style: none; margin: 0; padding: 2px;
}
.dropdown {
  position: absolute; top: 100%; left: 0; min-width: 200px;
  background: #fff; border: 1px solid #aca899;
  box-shadow: 3px 3px 4px rgba(0, 0, 0, .3);
}
.dropdown button, .sm-list button, .sm-foot button {
  display: block; width: 100%; text-align: left;
  background: none; border: 0; padding: 5px 22px;
  font: 13px var(--font); cursor: default;
}
.dropdown button:hover, .sm-list button:hover { background: var(--xp-select); color: #fff; }
.sep { height: 1px; margin: 3px 2px; background: #d4d0c8; }

/* ---------- Banner ---------- */
.banner {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 14px;
  background: linear-gradient(90deg, #fff 0%, #dbe8fb 100%);
  border-bottom: 2px solid #b7c9ea;
}
.banner p { margin: 0; max-width: 780px; }
.banner-icon { font-size: 34px; }
.t-red { color: var(--xp-red); }
.t-green { color: var(--xp-green); }

/* ---------- Body ---------- */
.window-body {
  display: grid; grid-template-columns: 6fr 5fr; gap: 10px;
  padding: 10px; flex: 1; min-height: 0;
}
@media (max-width: 900px) {
  .window-body { grid-template-columns: 1fr; }
  body { overflow: auto; }
  .desktop { padding: 0 0 var(--taskbar-h); }
  .window { border-radius: 0; border-left: 0; border-right: 0; }
}
.window.maximized .window-body { overflow: auto; }

/* ---------- Tabs ---------- */
.tabs { display: flex; gap: 2px; padding-left: 4px; position: relative; top: 1px; }
.tab {
  padding: 5px 14px 4px; margin-top: 2px;
  background: linear-gradient(180deg, #fff 0%, #ecebe5 100%);
  border: 1px solid #919b9c; border-bottom: 0;
  border-radius: 3px 3px 0 0;
  font: 13px var(--font); cursor: default;
}
.tab:hover { box-shadow: inset 0 2px 0 #e68b2c; }
.tab.active {
  margin-top: 0; padding-top: 7px; background: #fcfcfe;
  box-shadow: inset 0 2px 0 #ffc73c; font-weight: bold;
}
.tab-panels {
  background: #fcfcfe; border: 1px solid #919b9c;
  padding: 12px; min-height: 380px;
}
.panel[hidden] { display: none; }

/* ---------- Group box ---------- */
fieldset {
  border: 1px solid #d0d0bf; border-radius: 4px;
  margin: 0 0 10px; padding: 8px 12px 10px; background: transparent;
}
legend { padding: 0 5px; color: var(--xp-link); font-weight: bold; }
.row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media (max-width: 520px) { .row { grid-template-columns: 1fr; } }
label { display: block; margin: 4px 0; }
label small { display: block; color: #6d6d6d; font-size: 11px; }
code { background: #f1efe2; border: 1px solid #d0d0bf; padding: 0 3px; font-size: 12px; }

input[type="number"], input[type="file"] {
  width: 100%; margin-top: 3px; padding: 4px 5px;
  font: 13px var(--font);
  background: #fff; border: 1px solid var(--xp-sunken);
}
input:focus { outline: 1px dotted #000; outline-offset: -3px; }

/* ---------- Tombol XP ---------- */
.btn-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0 6px; }
.btn-row.center { justify-content: center; margin: 4px 0 14px; }
.btn-row.top { margin-top: 0; }

.xp-btn {
  min-width: 80px; padding: 4px 14px;
  font: 13px var(--font); color: #000; cursor: default;
  background: linear-gradient(180deg, #fff 0%, #ecebe5 86%, #d8d0c4 100%);
  border: 1px solid #003c74; border-radius: 3px;
}
.xp-btn:hover:not(:disabled) { box-shadow: inset 0 0 0 2px #f9c866; }
.xp-btn:active:not(:disabled) { background: #d8d0c4; box-shadow: none; }
.xp-btn.default { box-shadow: inset 0 0 0 2px #7cb5f9; }
.xp-btn.default:hover:not(:disabled) { box-shadow: inset 0 0 0 2px #f9c866; }
.xp-btn:disabled { color: #a0a0a0; border-color: #c9c7ba; }
.xp-btn:focus-visible { outline: 1px dotted #000; outline-offset: -4px; }

.hint { color: #5b5b5b; font-size: 12px; margin: 6px 0; }
.inline-error {
  margin: 8px 0; padding: 6px 8px;
  background: #fff4f4; border: 1px solid #cc2200; color: #8a1a00;
}

/* ---------- Kotak pesan hasil ---------- */
.msgbox {
  margin-top: 12px; background: var(--xp-face);
  border: 3px solid var(--xp-border); border-top: 0; border-radius: 7px 7px 2px 2px;
  box-shadow: 2px 3px 8px rgba(0, 0, 0, .3);
}
.msgbox .titlebar { min-height: 24px; padding: 2px 6px; border-radius: 4px 4px 0 0; }
.msgbox .titlebar h1 { font-size: 13px; }
.msgbox.darurat .titlebar {
  background: linear-gradient(180deg, #ff8a70 0%, #e0301a 10%, #cc2200 45%, #e0452a 90%, #a81800 100%);
  text-shadow: 1px 1px #5a0e00;
}
.msgbox-body { display: flex; gap: 12px; padding: 12px; background: #fff; margin: 6px; border: 1px solid #aca899; }
.msgbox-body h2 { margin: 0 0 4px; font: bold 15px var(--font); }
.msgbox.darurat h2 { color: var(--xp-red); }
.msgbox.aman h2 { color: var(--xp-green); }
.msgbox-body p { margin: 3px 0; }

.msg-icon {
  flex: none; width: 34px; height: 34px; border-radius: 50%;
  display: grid; place-items: center;
  font: bold 20px "Times New Roman", serif; color: #fff;
  border: 2px solid #fff; box-shadow: 0 0 0 1px #5d5d5d, 1px 2px 3px rgba(0,0,0,.4);
}
.msg-icon.info  { background: radial-gradient(circle at 35% 30%, #8cc4ff, #1e63d6); font-style: italic; }
.msg-icon.error { background: radial-gradient(circle at 35% 30%, #ffa08a, #d4331a); font-family: var(--font); }
.msg-icon.ok    { background: radial-gradient(circle at 35% 30%, #9be08a, #2f8a1f); font-family: var(--font); }

/* ---------- Progress bar XP ---------- */
.progress {
  display: inline-block; width: 120px; height: 12px; vertical-align: middle;
  border: 1px solid #686868; border-radius: 3px; background: #fff;
  padding: 1px; overflow: hidden; position: relative;
}
.progress i {
  position: absolute; top: 1px; bottom: 1px; width: 40px; left: -40px;
  background: repeating-linear-gradient(90deg, #37d12b 0 6px, transparent 6px 8px);
  animation: marquee 1.1s linear infinite;
}
@keyframes marquee { to { left: 120px; } }

.meter { height: 14px; border: 1px solid #686868; border-radius: 3px; background: #fff; padding: 1px; margin: 8px 0 3px; }
.meter span {
  display: block; height: 100%;
  background: repeating-linear-gradient(90deg, #37d12b 0 6px, transparent 6px 8px);
}
.meter.red span { background: repeating-linear-gradient(90deg, #e2381c 0 6px, transparent 6px 8px); }
.meter-label { font-size: 12px; color: #444; }

/* ---------- Peta ---------- */
.right { min-width: 0; }
.map-box { height: 100%; margin: 0; }
#map { height: 420px; border: 2px inset #aca899; background: #cfd8e6; }
.window.maximized #map { height: calc(100vh - 330px); min-height: 320px; }
.legend { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 8px; font-size: 12px; }
.dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 4px; }
.dot.red { background: #dc2626; } .dot.green { background: #16a34a; }
.dot.dash { border-radius: 0; background: none; border: 1px dashed #c2410c; }

/* ---------- ListView ---------- */
.listview { overflow-x: auto; border: 1px solid var(--xp-sunken); background: #fff; margin-top: 8px; }
.listview[hidden] { display: none; }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
th {
  padding: 4px 8px; text-align: left; white-space: nowrap; font-weight: normal;
  background: linear-gradient(180deg, #fff, #ebeadb);
  border-right: 1px solid #d0cfbc; border-bottom: 1px solid #aca899;
}
td { padding: 3px 8px; white-space: nowrap; }
tbody tr:hover { background: var(--xp-select); color: #fff; }
.tag { font-weight: bold; }
.tag.darurat { color: var(--xp-red); } .tag.aman { color: var(--xp-green); }
tbody tr:hover .tag { color: #fff; }

.summary { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
.summary .pill { background: var(--xp-face); border: 1px solid #aca899; padding: 3px 9px; }

.history { list-style: none; margin: 0; padding: 0; border: 1px solid var(--xp-sunken); background: #fff; }
.history:empty { display: none; }
.history li { padding: 5px 8px; border-bottom: 1px dotted #d0d0bf; font-size: 12px; }
.history li:hover { background: var(--xp-select); color: #fff; }
.history .when { display: block; color: #6d6d6d; font-size: 11px; }
.history li:hover .when, .history li:hover .tag { color: #fff; }

/* ---------- Status bar ---------- */
.statusbar { display: flex; gap: 2px; padding: 3px 4px; background: var(--xp-face); border-top: 1px solid #fff; font-size: 12px; }
.statusbar .cell { padding: 2px 8px; border: 1px solid; border-color: #aca899 #fff #fff #aca899; white-space: nowrap; }
.statusbar .grow { flex: 1; overflow: hidden; text-overflow: ellipsis; }

/* ---------- Taskbar ---------- */
.taskbar {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 50;
  height: var(--taskbar-h); display: flex; align-items: stretch; gap: 6px;
  background: linear-gradient(180deg, #245edc 0%, #3f8cf3 9%, #245edc 18%, #245edc 92%, #1941a5 100%);
  border-top: 1px solid #0c3ec0;
}
.start-btn {
  display: flex; align-items: center; gap: 6px; padding: 0 22px 0 10px; margin-right: 8px;
  border: 0; border-radius: 0 12px 12px 0; cursor: default;
  background: linear-gradient(180deg, #5fb957 0%, #3c9a30 12%, #2f8a22 50%, #3a9d2e 88%, #2a7a1d 100%);
  box-shadow: inset -2px 0 3px rgba(0, 0, 0, .35), 2px 0 3px rgba(0, 0, 0, .3);
}
.start-btn:hover { filter: brightness(1.1); }
.start-btn em { color: #fff; font: italic bold 19px "Franklin Gothic Medium", "Trebuchet MS", sans-serif; text-shadow: 1px 1px 2px rgba(0,0,0,.6); }
.flag {
  width: 16px; height: 16px; transform: skew(-4deg);
  background: conic-gradient(#f25022 0 25%, #7fba00 0 50%, #00a4ef 0 75%, #ffb900 0);
  border-radius: 2px;
}
.task-btn {
  align-self: center; width: 200px; height: 24px; padding: 0 8px; text-align: left; color: #fff;
  font: 12px var(--font); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  background: linear-gradient(180deg, #5b95f0, #3c7de8); border: 1px solid #1c4bb0; border-radius: 3px; cursor: default;
}
.task-btn.active { background: linear-gradient(180deg, #1e4fb8, #2a5ec9); box-shadow: inset 1px 1px 3px rgba(0,0,0,.5); }
.tray {
  margin-left: auto; display: flex; align-items: center; gap: 8px; padding: 0 12px; color: #fff; font-size: 12px;
  background: linear-gradient(180deg, #0c8fe8 0%, #1294ea 20%, #0f84dc 90%, #0b6cbf 100%);
  border-left: 1px solid #0b4fa8; box-shadow: inset 1px 0 0 #3cb0f5;
}

/* ---------- Start menu ---------- */
.start-menu {
  position: fixed; left: 0; bottom: var(--taskbar-h); z-index: 60; width: 280px;
  background: #fff; border: 2px solid #0c3ec0; border-radius: 8px 8px 0 0;
  box-shadow: 3px 3px 8px rgba(0,0,0,.4); overflow: hidden;
}
.sm-head {
  display: flex; align-items: center; gap: 10px; padding: 8px 10px; color: #fff; font: bold 14px var(--font-title);
  background: linear-gradient(180deg, #4d8cf3 0%, #1f5fd6 50%, #1a4fb8 100%); text-shadow: 1px 1px #0f1089;
}
.avatar { display: grid; place-items: center; width: 36px; height: 36px; font-size: 22px; background: #fff; border: 2px solid #e8eefc; border-radius: 4px; }
.sm-list button { padding: 7px 14px; font-size: 13px; }
.sm-foot { padding: 5px 8px; background: linear-gradient(180deg, #4d8cf3, #1f5fd6); text-align: right; }
.sm-foot button { display: inline-block; width: auto; padding: 4px 10px; color: #fff; font-weight: bold; }
.sm-foot button:hover { background: rgba(255,255,255,.2); }

/* ---------- Dialog ---------- */
.overlay { position: fixed; inset: 0; z-index: 100; display: grid; place-items: center; background: rgba(0, 0, 0, .25); }
.overlay[hidden], .start-menu[hidden], .dropdown[hidden], .progress[hidden], [hidden].inline-error, .summary[hidden] { display: none; }
.dialog { width: min(420px, 92vw); }
.dlg-body { display: flex; gap: 14px; align-items: flex-start; padding: 18px 16px 10px; }
.dlg-body p { margin: 4px 0 0; }
```

### 7.3 `public/script.js`

```javascript
/* Frontend (tema Windows XP) - Klasifikasi Wilayah Pemadaman Karhutla Kalimantan */

// Kosongkan jika frontend & backend satu domain (Flask lokal / Vercel).
const API_BASE = "";

const PRESETS = {
  palangkaraya: { latitude: -2.20, longitude: 113.91, brightness: 350.5, confidence: 100 },
  pontianak:    { latitude: -0.02, longitude: 109.33, brightness: 310.2, confidence: 82 },
};
const FIELDS = ["latitude", "longitude", "brightness", "confidence"];
const HISTORY_KEY = "karhutla_history_v1";
const MAX_HISTORY = 15;

const $ = (id) => document.getElementById(id);

/* ======================= PETA ======================= */
const map = L.map("map").setView([0.2, 114], 6);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18, attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

L.rectangle([[-4.5, 108.5], [4.5, 119.5]], {
  color: "#c2410c", weight: 1.5, fill: false, dashArray: "6 6",
}).addTo(map);

const markerLayer = L.layerGroup().addTo(map);
let pickMarker = null;

map.on("click", (e) => {
  const lat = +e.latlng.lat.toFixed(5);
  const lng = +e.latlng.lng.toFixed(5);
  $("latitude").value = lat;
  $("longitude").value = lng;
  if (pickMarker) map.removeLayer(pickMarker);
  pickMarker = L.circleMarker([lat, lng], { radius: 6, color: "#475569", fillOpacity: 0.4 }).addTo(map);
  setStatus(`Koordinat dipilih: ${lat}, ${lng}`);
});

function addResultMarker(r, label) {
  const color = r.label === 1 ? "#dc2626" : "#16a34a";
  const m = L.circleMarker([r.input.latitude, r.input.longitude], {
    radius: r.label === 1 ? 9 : 6, color, fillColor: color, fillOpacity: 0.7, weight: 2,
  });
  m.bindPopup(
    `<strong>${r.status}</strong>${label ? " &middot; #" + label : ""}<br>` +
    `P(Darurat): ${r.probabilitas.darurat}%<br>` +
    `Lat ${r.input.latitude}, Lon ${r.input.longitude}`
  );
  m.addTo(markerLayer);
  return m;
}

/* ======================= HELPER UI ======================= */
function setStatus(text) { $("status-text").textContent = text; }

function setBusy(busy, text) {
  $("progress").hidden = !busy;
  if (text) setStatus(text);
}

function showError(el, msg) { el.textContent = msg; el.hidden = !msg; }

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

async function callApi(path, body) {
  const res = await fetch(API_BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = Array.isArray(data.detail) ? " " + data.detail.join(" ") : "";
    throw new Error((data.error || "Terjadi kesalahan pada server.") + detail);
  }
  return data;
}

/* ======================= DIALOG XP ======================= */
function showDialog(title, text, type = "info") {
  $("dlg-title").textContent = title;
  $("dlg-text").textContent = text;
  const icon = $("dlg-icon");
  icon.className = `msg-icon ${type}`;
  icon.textContent = type === "error" ? "X" : type === "ok" ? "✓" : "i";
  $("overlay").hidden = false;
  $("dlg-ok").focus();
}
const closeDialog = () => { $("overlay").hidden = true; };
$("dlg-ok").addEventListener("click", closeDialog);
$("dlg-x").addEventListener("click", closeDialog);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeDialog(); closeMenus(); } });

/* ======================= TAB ======================= */
function activateTab(name) {
  document.querySelectorAll(".tab").forEach((t) => {
    const on = t.dataset.tab === name;
    t.classList.toggle("active", on);
    t.setAttribute("aria-selected", on);
  });
  document.querySelectorAll(".panel").forEach((p) => { p.hidden = p.id !== `tab-${name}`; });
  if (name === "history") renderHistory();
}
document.querySelectorAll(".tab").forEach((t) =>
  t.addEventListener("click", () => activateTab(t.dataset.tab))
);

/* ======================= MENU, START, JENDELA ======================= */
const win = $("main-window");

function closeMenus() {
  document.querySelectorAll(".dropdown").forEach((d) => (d.hidden = true));
  document.querySelectorAll(".menu > button").forEach((b) => b.classList.remove("open"));
  $("start-menu").hidden = true;
}

document.querySelectorAll("[data-menu]").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const dd = $(btn.dataset.menu);
    const willOpen = dd.hidden;
    closeMenus();
    dd.hidden = !willOpen;
    btn.classList.toggle("open", willOpen);
  });
});

$("start-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  const willOpen = $("start-menu").hidden;
  closeMenus();
  $("start-menu").hidden = !willOpen;
});
document.addEventListener("click", closeMenus);

function restoreWindow() {
  win.classList.remove("minimized");
  $("task-btn").classList.add("active");
}
$("btn-min").addEventListener("click", () => {
  win.classList.add("minimized");
  $("task-btn").classList.remove("active");
});
$("task-btn").addEventListener("click", () => {
  if (win.classList.contains("minimized")) restoreWindow();
  else $("btn-min").click();
});
$("btn-max").addEventListener("click", () => {
  win.classList.toggle("maximized");
  setTimeout(() => map.invalidateSize(), 50);
});
$("btn-close").addEventListener("click", () => runAction("exit"));

function applyPreset(name) {
  const p = PRESETS[name];
  FIELDS.forEach((f) => ($(f).value = p[f]));
  showError($("form-error"), "");
  activateTab("single");
  setStatus(`Contoh dimuat: ${name}`);
}

function runAction(action) {
  closeMenus();
  restoreWindow();
  if (action.startsWith("tab-")) return activateTab(action.slice(4));
  if (action.startsWith("preset-")) return applyPreset(action.slice(7));
  switch (action) {
    case "sample-csv": return downloadSample();
    case "clear-history": return clearHistory();
    case "about":
      return showDialog(
        "Tentang Aplikasi",
        "Klasifikasi Wilayah Pemadaman Karhutla di Kalimantan menggunakan Naive Bayes. " +
        "Data: NASA FIRMS (MODIS C6.1 NRT). Label DARURAT jika FRP > 30 MW.", "info");
    case "exit":
      return showDialog("Tutup Aplikasi",
        "Aplikasi ini berjalan di browser. Tutup tab browser untuk keluar.", "info");
  }
}
document.querySelectorAll("[data-action]").forEach((el) =>
  el.addEventListener("click", () => runAction(el.dataset.action))
);
document.querySelectorAll("[data-preset]").forEach((el) =>
  el.addEventListener("click", () => applyPreset(el.dataset.preset))
);

/* Jam di taskbar */
function tickClock() {
  $("clock").textContent = new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}
tickClock();
setInterval(tickClock, 15000);

/* ======================= KLASIFIKASI TUNGGAL ======================= */
function readForm() {
  const point = {};
  for (const f of FIELDS) {
    const raw = $(f).value.trim();
    if (raw === "" || Number.isNaN(Number(raw))) throw new Error(`Kolom ${f} wajib diisi dengan angka.`);
    point[f] = Number(raw);
  }
  return point;
}

function renderResult(r) {
  const cls = r.label === 1 ? "darurat" : "aman";
  const box = $("result");
  box.innerHTML = `
    <div class="msgbox ${cls}">
      <div class="titlebar"><h1>Hasil Klasifikasi</h1></div>
      <div class="msgbox-body">
        <span class="msg-icon ${r.label === 1 ? "error" : "ok"}" aria-hidden="true">${r.label === 1 ? "!" : "✓"}</span>
        <div>
          <h2>${r.label === 1 ? "DARURAT (Prioritas Pemadaman)" : "AMAN (Terkendali)"}</h2>
          <p><strong>Tindakan:</strong> ${escapeHtml(r.tindakan)}</p>
          <p><strong>Potensi:</strong> ${escapeHtml(r.potensi)}</p>
          <p><strong>Keyakinan model:</strong> ${r.keyakinan_persen}%</p>
          <div class="meter ${r.label === 1 ? "red" : ""}" role="img" aria-label="Probabilitas darurat ${r.probabilitas.darurat} persen">
            <span style="width:${r.probabilitas.darurat}%"></span>
          </div>
          <div class="meter-label">P(Darurat) ${r.probabilitas.darurat}% &middot; P(Aman) ${r.probabilitas.aman}%</div>
        </div>
      </div>
    </div>`;
  box.hidden = false;
}

$("predict-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = $("form-error");
  const btn = $("btn-predict");
  showError(errEl, "");

  let point;
  try { point = readForm(); } catch (err) { return showError(errEl, err.message); }

  btn.disabled = true;
  setBusy(true, "Memproses klasifikasi...");
  try {
    const result = await callApi("/api/predict", point);
    renderResult(result);
    markerLayer.clearLayers();
    addResultMarker(result).openPopup();
    map.setView([point.latitude, point.longitude], Math.max(map.getZoom(), 8));
    saveHistory(result);
    setStatus(`Selesai: ${result.status} (P darurat ${result.probabilitas.darurat}%)`);
  } catch (err) {
    showError(errEl, err.message);
    setStatus("Gagal memproses");
  } finally {
    btn.disabled = false;
    setBusy(false);
  }
});

/* ======================= RIWAYAT ======================= */
function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch { return []; }
}
function saveHistory(r) {
  const list = loadHistory();
  list.unshift({
    waktu: new Date().toLocaleString("id-ID"),
    status: r.status, label: r.label, pDarurat: r.probabilitas.darurat, input: r.input,
  });
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, MAX_HISTORY))); } catch { /* abaikan */ }
}
function renderHistory() {
  const list = loadHistory();
  $("history").innerHTML = list.map((h) => `
    <li>
      <span class="tag ${h.label === 1 ? "darurat" : "aman"}">${h.status}</span>
      (${h.input.latitude}, ${h.input.longitude}) &middot; ${h.input.brightness} K &middot; conf ${h.input.confidence}%
      &middot; P(Darurat) ${h.pDarurat}%
      <span class="when">${escapeHtml(h.waktu)}</span>
    </li>`).join("");
  $("history-empty").hidden = list.length > 0;
}
function clearHistory() {
  try { localStorage.removeItem(HISTORY_KEY); } catch { /* abaikan */ }
  renderHistory();
  setStatus("Riwayat dihapus");
}
$("btn-clear").addEventListener("click", clearHistory);

/* ======================= BATCH CSV ======================= */
function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error("CSV kosong atau tidak memiliki baris data.");
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const idx = {};
  for (const f of FIELDS) {
    idx[f] = header.indexOf(f);
    if (idx[f] === -1) throw new Error(`Kolom '${f}' tidak ditemukan di header CSV.`);
  }
  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    const row = {};
    for (const f of FIELDS) row[f] = cols[idx[f]] !== undefined ? cols[idx[f]].trim() : "";
    return row;
  });
}

$("btn-batch").addEventListener("click", async () => {
  const errEl = $("batch-error");
  const btn = $("btn-batch");
  showError(errEl, "");

  const file = $("csv-file").files[0];
  if (!file) return showError(errEl, "Pilih file CSV terlebih dahulu.");

  btn.disabled = true;
  setBusy(true, "Memproses berkas CSV...");
  try {
    const points = parseCsv(await file.text());
    if (points.length > 500) throw new Error("Maksimal 500 baris per unggahan.");
    const data = await callApi("/api/predict-batch", { points });
    renderBatch(data);
    setStatus(`CSV selesai: ${data.total_diproses} titik diproses`);
  } catch (err) {
    showError(errEl, err.message);
    setStatus("Gagal memproses CSV");
  } finally {
    btn.disabled = false;
    setBusy(false);
  }
});

function renderBatch(data) {
  const summary = $("batch-summary");
  summary.innerHTML = `
    <span class="pill">Diproses: <strong>${data.total_diproses}</strong> / ${data.total_dikirim}</span>
    <span class="pill">Darurat: <strong>${data.total_darurat}</strong></span>
    <span class="pill">Aman: <strong>${data.total_aman}</strong></span>
    ${data.dilewati.length ? `<span class="pill">Dilewati: <strong>${data.dilewati.length}</strong></span>` : ""}`;
  summary.hidden = false;

  $("batch-table").querySelector("tbody").innerHTML = data.hasil.map((r, i) => `
    <tr>
      <td>${i + 1}</td><td>${r.input.latitude}</td><td>${r.input.longitude}</td>
      <td>${r.input.brightness}</td><td>${r.input.confidence}</td>
      <td><span class="tag ${r.label === 1 ? "darurat" : "aman"}">${r.status}</span></td>
      <td>${r.probabilitas.darurat}%</td>
    </tr>`).join("");
  $("batch-table").hidden = data.hasil.length === 0;

  markerLayer.clearLayers();
  const bounds = [];
  data.hasil.forEach((r, i) => {
    addResultMarker(r, i + 1);
    bounds.push([r.input.latitude, r.input.longitude]);
  });
  if (bounds.length) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 9 });
}

function downloadSample() {
  const csv = [
    "latitude,longitude,brightness,confidence",
    "-2.20,113.91,350.5,100",
    "-0.02,109.33,310.2,82",
    "-2.80,110.70,380.0,100",
    "-3.22,113.76,345.0,95",
  ].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: "contoh_titik_panas.csv" });
  a.click();
  URL.revokeObjectURL(url);
}
$("btn-sample").addEventListener("click", downloadSample);

/* ======================= INFO MODEL & STATUS API ======================= */
async function checkHealth() {
  try {
    const res = await fetch(API_BASE + "/api/health");
    const j = await res.json();
    $("status-api").textContent = j.model_loaded ? "API: online" : "API: model belum dimuat";
  } catch {
    $("status-api").textContent = "API: offline";
  }
}

async function loadModelInfo() {
  const box = $("model-info");
  try {
    const res = await fetch(API_BASE + "/api/model-info");
    if (!res.ok) throw new Error();
    const info = await res.json();
    box.innerHTML = `
      <p><strong>Model aktif:</strong> ${escapeHtml(info.model_name || "Naive Bayes")}<br>
      <strong>Fitur:</strong> ${info.features.join(", ")}<br>
      <strong>Aturan label:</strong> FRP &gt; ${info.frp_threshold_mw ?? 30} MW = DARURAT</p>`;
    if (info.comparison) {
      $("compare-table").querySelector("tbody").innerHTML = info.comparison.map((m) => `
        <tr><td>${escapeHtml(m.model)}</td><td>${m.accuracy}</td><td>${m.sensitivity}</td>
        <td>${m.specificity}</td><td>${m.kappa}</td><td>${m.rmse}</td><td>${m.auc}</td></tr>`).join("");
      $("compare-table").hidden = false;
    }
  } catch {
    box.textContent = "Informasi model tidak dapat dimuat. Pastikan backend berjalan.";
  }
}

/* ======================= INIT ======================= */
renderHistory();
checkHealth();
loadModelInfo();
setStatus("Siap");
```

---

## 8. Menjalankan Secara Lokal

```bash
# 1. Siapkan lingkungan
cd karhutla-app
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt

# 2. Latih model (menghasilkan api/model_karhutla_NB.pkl dan api/model_info.json)
python model/train_model.py model/fire_nrt_M-C61_825606.csv

# 3. Jalankan server (backend + frontend)
python api/index.py
```

Buka **http://localhost:5000** di browser.

Uji API lewat terminal:

```bash
curl -X POST http://localhost:5000/api/predict \
  -H "Content-Type: application/json" \
  -d '{"latitude": -2.20, "longitude": 113.91, "brightness": 350.5, "confidence": 100}'
```

---

## 9. Deploy ke Vercel

Proyek ini memakai pola standar Vercel: folder `public/` dilayani sebagai file statis, dan `api/index.py` (Flask) berjalan sebagai Serverless Function.

### 9.1 File konfigurasi

**`vercel.json`**

```json
{
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/index" }
  ]
}
```

Semua permintaan `/api/...` diteruskan ke aplikasi Flask. Halaman `/`, `style.css`, dan `script.js` dilayani otomatis dari `public/`.

**`.vercelignore`** (dataset dan folder training tidak perlu ikut diunggah)

```
model/
*.csv
venv/
__pycache__/
```

**`.python-version`**

```
3.12
```

**`.gitignore`**

```
venv/
__pycache__/
*.csv
.vercel
```

### 9.2 Checklist sebelum deploy

1. File **`api/model_karhutla_NB.pkl`** sudah ada. Ambil dari Colab (`joblib.dump(best_model, 'model_karhutla_NB.pkl')`, lalu unduh) atau hasil `python model/train_model.py <path_csv>`.
2. Versi `scikit-learn` di `requirements.txt` sama dengan versi saat training. Cek di Colab/lokal: `python -c "import sklearn; print(sklearn.__version__)"`, lalu sesuaikan barisnya (contoh: `scikit-learn==1.6.1`). Versi `numpy` dan `pandas` ikut disesuaikan bila muncul error saat build.
3. Uji lokal berhasil: `python api/index.py`, buka `http://localhost:5000`.

### 9.3 Cara A - Deploy lewat GitHub (disarankan)

```bash
cd karhutla-app
git init
git add .
git commit -m "Sistem klasifikasi karhutla Kalimantan"
git branch -M main
git remote add origin https://github.com/<username>/karhutla-app.git
git push -u origin main
```

Lalu di [vercel.com](https://vercel.com): **Add New > Project > Import** repositori tersebut. Pengaturan:

| Pengaturan | Nilai |
|---|---|
| Framework Preset | Other |
| Root Directory | `./` |
| Build Command | kosongkan |
| Output Directory | kosongkan |

Klik **Deploy**. Setiap `git push` berikutnya akan men-deploy ulang otomatis.

### 9.4 Cara B - Deploy lewat Vercel CLI

```bash
npm i -g vercel
cd karhutla-app
vercel login
vercel          # preview
vercel --prod   # produksi
```

### 9.5 Verifikasi setelah deploy

```bash
curl https://<domain-anda>.vercel.app/api/health
# {"model_loaded":true,"status":"ok"}

curl -X POST https://<domain-anda>.vercel.app/api/predict \
  -H "Content-Type: application/json" \
  -d '{"latitude": -2.20, "longitude": 113.91, "brightness": 350.5, "confidence": 100}'
```

Lalu buka `https://<domain-anda>.vercel.app` dan coba tombol contoh Palangkaraya dan Pontianak.

### 9.6 Pemecahan masalah

| Gejala | Penyebab dan solusi |
|---|---|
| `/api/health` menampilkan `model_loaded: false`, atau klasifikasi membalas 503 | File `.pkl` belum ada di `api/` atau tidak ikut ter-commit. Pastikan tidak ter-ignore, lalu deploy ulang. |
| Error `InconsistentVersionWarning` atau gagal memuat model | Versi scikit-learn di `requirements.txt` berbeda dengan saat training. Samakan versinya. |
| Build gagal saat memasang `numpy`/`pandas` | Sesuaikan versi dengan Python 3.12 (`.python-version`), atau gunakan versi yang sama dengan lingkungan training. |
| `404` pada `/api/predict` | Pastikan `vercel.json` ada di root proyek dan folder `api/` berisi `index.py`. |
| Halaman tampil tetapi info model "tidak dapat dimuat" | Backend belum jalan atau model belum ada. Cek `/api/health` dan log di dashboard Vercel (tab *Logs*). |
| Ukuran deploy terlalu besar | Pastikan CSV dan folder `model/` tidak terunggah (cek `.vercelignore`). Model Naive Bayes hanya beberapa KB. |

> Batasan: Vercel Serverless bersifat tanpa status (stateless). Riwayat klasifikasi disimpan di `localStorage` browser pengguna, bukan di server.

---

## 10. Dokumentasi API

### `GET /api/health`
```json
{ "status": "ok", "model_loaded": true }
```

### `GET /api/model-info`
Mengembalikan fitur, batas validasi, nama model, dan tabel perbandingan metrik (dari `model_info.json`).

### `POST /api/predict`

**Request**
```json
{
  "latitude": -2.20,
  "longitude": 113.91,
  "brightness": 350.5,
  "confidence": 100
}
```

**Response 200** (contoh bentuk respons; angka probabilitas bergantung pada model yang Anda latih)
```json
{
  "input": { "latitude": -2.2, "longitude": 113.91, "brightness": 350.5, "confidence": 100.0 },
  "label": 1,
  "status": "DARURAT",
  "keyakinan_persen": 99.99,
  "probabilitas": { "aman": 0.01, "darurat": 99.99 },
  "tindakan": "Segera kerahkan unit pemadam ke lokasi (prioritas pemadaman).",
  "potensi": "Potensi kebakaran masif dan asap tebal."
}
```

**Response 400**
```json
{ "error": "Input tidak valid", "detail": ["Field 'confidence' harus di antara 80.0 dan 100.0."] }
```

### `POST /api/predict-batch`

**Request**
```json
{
  "points": [
    { "latitude": -2.20, "longitude": 113.91, "brightness": 350.5, "confidence": 100 },
    { "latitude": -0.02, "longitude": 109.33, "brightness": 310.2, "confidence": 82 }
  ]
}
```

**Response 200**
```json
{
  "total_dikirim": 2,
  "total_diproses": 2,
  "total_darurat": 1,
  "total_aman": 1,
  "dilewati": [],
  "hasil": [ { "status": "DARURAT", "...": "..." }, { "status": "AMAN", "...": "..." } ]
}
```

### Tabel validasi input

| Field | Rentang | Alasan |
|---|---|---|
| `latitude` | -4.5 s.d. 4.5 | Bounding box Kalimantan pada notebook |
| `longitude` | 108.5 s.d. 119.5 | Bounding box Kalimantan pada notebook |
| `brightness` | 250 s.d. 520 K | Kisaran wajar suhu piksel MODIS |
| `confidence` | 80 s.d. 100 % | Model hanya dilatih pada data confidence >= 80 |

---

## 11. Catatan dan Keterbatasan

1. **Label berasal dari FRP.** Status DARURAT ditentukan dari aturan `frp > 30 MW`, bukan dari kejadian pemadaman sebenarnya di lapangan. Model mempelajari pendekatan (proxy) tingkat keparahan api dari lokasi, suhu, dan confidence. Hasilnya cocok sebagai **alat bantu prioritas**, bukan pengganti keputusan petugas lapangan.
2. **FRP tidak dipakai sebagai fitur** (agar tidak terjadi kebocoran label), sehingga akurasi sekitar 82% adalah batas wajar untuk empat fitur ini. Menambah fitur seperti `bright_t31`, `scan`, `track`, `daynight`, jenis lahan (gambut/non-gambut), kondisi cuaca (curah hujan, kecepatan angin), dan jarak ke permukiman berpotensi meningkatkan kinerja.
3. **Pembagian data acak.** Titik panas yang berdekatan secara ruang dan waktu saling mirip, sehingga pembagian acak 70/30 dapat membuat skor evaluasi sedikit lebih optimistis daripada kondisi nyata. Untuk penelitian lanjutan, pertimbangkan pembagian berdasarkan waktu (misalnya Agustus - September latih, Oktober uji) atau berdasarkan wilayah.
4. **Probabilitas Naive Bayes cenderung ekstrem** (mendekati 0% atau 100%) karena asumsi independensi fitur. Angka keyakinan sebaiknya dibaca sebagai skor relatif, bukan peluang yang terkalibrasi.
5. **Data yang dilatih hanya periode Agustus - Oktober 2026.** Untuk penggunaan operasional, perbarui model secara berkala dengan data FIRMS terbaru (jalankan ulang `train_model.py`).
6. **Pemakaian peta OpenStreetMap** pada frontend mengikuti kebijakan penggunaan tile OSM; untuk trafik tinggi gunakan penyedia tile sendiri.

---

*Dokumen ini dibuat berdasarkan notebook `Karhutla2.ipynb`.*
