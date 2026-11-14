# Klasifikasi Wilayah Pemadaman Karhutla di Kalimantan

Backend Flask (`api/index.py`) + frontend HTML/CSS/JS (`public/`), siap deploy ke Vercel.

## Wajib sebelum deploy
Letakkan model hasil notebook di **`api/model_karhutla_NB.pkl`**
(dari Colab: `joblib.dump(best_model, 'model_karhutla_NB.pkl')`, lalu unduh).
Opsional: `api/model_info.json` untuk tabel perbandingan model (dibuat otomatis oleh `model/train_model.py`).

Samakan versi scikit-learn di `requirements.txt` dengan versi di Colab (`import sklearn; print(sklearn.__version__)`).

## Lokal
    pip install -r requirements.txt
    python model/train_model.py model/fire_nrt_M-C61_825606.csv   # jika belum punya .pkl
    python api/index.py                                          # http://localhost:5000

## Deploy ke Vercel
    npm i -g vercel
    vercel login
    vercel --prod
atau push ke GitHub lalu Import Project di vercel.com (Framework Preset: Other).
Cek `https://<domain>/api/health` -> `model_loaded: true`.
