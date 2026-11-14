"""
Backend REST API - Klasifikasi Wilayah Pemadaman Karhutla Kalimantan.

Endpoint:
    GET  /api/health        (dan /health)
    GET  /api/model-info    (dan /model-info)
    POST /api/predict       (dan /predict)        -> 1 titik
    POST /api/predict-batch (dan /predict-batch)  -> banyak titik (maks. 500)
"""
import json
import os
import sys
import traceback
from pathlib import Path

import numpy as np
import pandas as pd
from flask import Flask, jsonify, request
from flask_cors import CORS

# ---------------------------------------------------------------- path
BASE_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = BASE_DIR.parent / "public"

app = Flask(__name__, static_folder=str(PUBLIC_DIR), static_url_path="")
CORS(app)


# ---------------------------------------------------------------- vercel middleware
class VercelPathMiddleware:
    """
    Middleware untuk memperbaiki PATH_INFO di Vercel ketika rewrite
    mengarahkan request ke /api/index.
    """
    def __init__(self, wsgi_app):
        self.wsgi_app = wsgi_app

    def __call__(self, environ, start_response):
        path = environ.get("PATH_INFO", "")
        if path in ("/api/index", "/api/index.py"):
            orig = environ.get("HTTP_X_VERCEL_FORWARDED_PATH") or environ.get("HTTP_X_MATCHED_PATH")
            if orig:
                environ["PATH_INFO"] = orig
        return self.wsgi_app(environ, start_response)


app.wsgi_app = VercelPathMiddleware(app.wsgi_app)


# ---------------------------------------------------------------- fallback model
class StandaloneGaussianNB:
    """
    Implementasi Gaussian Naive Bayes murni menggunakan NumPy.
    Menghasilkan output probabilitas matematis identik dengan scikit-learn GaussianNB,
    namun bebas dari masalah kompatibilitas versi pickle / joblib / scikit-learn di Vercel.
    """
    def __init__(self, theta, var, class_prior, classes):
        self.theta = np.array(theta, dtype=float)
        self.var = np.array(var, dtype=float)
        self.class_prior = np.array(class_prior, dtype=float)
        self.classes = np.array(classes)

    def predict_proba(self, X):
        X = np.asarray(X, dtype=float)
        log_probs = []
        for c in range(len(self.class_prior)):
            l_prior = np.log(self.class_prior[c])
            l_lik = -0.5 * np.sum(
                np.log(2.0 * np.pi * self.var[c]) + ((X - self.theta[c]) ** 2) / self.var[c],
                axis=1
            )
            log_probs.append(l_prior + l_lik)
        log_probs = np.array(log_probs).T
        max_log = np.max(log_probs, axis=1, keepdims=True)
        exp_probs = np.exp(log_probs - max_log)
        probs = exp_probs / np.sum(exp_probs, axis=1, keepdims=True)
        return probs


# ---------------------------------------------------------------- model loading
FEATURES = ["latitude", "longitude", "brightness", "confidence"]

FALLBACK_PARAMS = {
    "theta": [
        [-1.883041071472961, 113.02468867495335, 320.462048477316, 90.46128029832194],
        [-1.9348132529854098, 112.80335579721341, 342.09519792127236, 94.95975232198143]
    ],
    "var": [
        [1.5255042251553277, 4.260081328722699, 47.36722825176283, 55.57702814881891],
        [1.626273135770299, 4.147417000524613, 358.62629494896345, 37.35884042657198]
    ],
    "class_prior": [0.47077067119199484, 0.5292293288080051],
    "classes": [0, 1]
}

MODEL = None
MODEL_SOURCE = None
MODEL_LOAD_LOG = []

MODEL_INFO = {}
_info_candidates = [
    BASE_DIR / "model_info.json",
    Path(os.getcwd()) / "api" / "model_info.json",
]
for _ip in _info_candidates:
    if _ip.exists():
        try:
            MODEL_INFO = json.loads(_ip.read_text(encoding="utf-8"))
            break
        except Exception as e:
            MODEL_LOAD_LOG.append(f"Gagal baca {_ip}: {e}")

# 1. Coba load via joblib
_pkl_candidates = [
    BASE_DIR / "model_karhutla_NB.pkl",
    Path(os.getcwd()) / "api" / "model_karhutla_NB.pkl",
    Path(os.getcwd()) / "model_karhutla_NB.pkl",
]

for _p in _pkl_candidates:
    if _p.exists():
        try:
            import joblib
            MODEL = joblib.load(_p)
            MODEL_SOURCE = f"joblib ({_p.name})"
            MODEL_LOAD_LOG.append(f"Berhasil memuat model dari {_p}")
            break
        except Exception as e:
            MODEL_LOAD_LOG.append(f"Gagal memuat {_p} via joblib: {e}")

# 2. Jika joblib gagal / file tidak ada, gunakan StandaloneGaussianNB
if MODEL is None:
    try:
        p = MODEL_INFO.get("model_params", FALLBACK_PARAMS)
        MODEL = StandaloneGaussianNB(
            theta=p["theta"],
            var=p["var"],
            class_prior=p["class_prior"],
            classes=p["classes"]
        )
        MODEL_SOURCE = "StandaloneGaussianNB (embedded fallback)"
        MODEL_LOAD_LOG.append("Memakai StandaloneGaussianNB fallback")
    except Exception as e:
        MODEL_LOAD_LOG.append(f"Gagal inisialisasi StandaloneGaussianNB: {e}\n{traceback.format_exc()}")

# Batas validasi (sesuai data latih di notebook)
LIMITS = {
    "latitude":   (-4.5, 4.5),      # bounding box Kalimantan
    "longitude":  (108.5, 119.5),
    "brightness": (250.0, 520.0),   # Kelvin, kisaran wajar MODIS
    "confidence": (80.0, 100.0),    # model dilatih hanya pada confidence >= 80
}
MAX_BATCH = 500


# ---------------------------------------------------------------- error handlers
@app.errorhandler(404)
def handle_404(e):
    return jsonify({"error": "Endpoint tidak ditemukan.", "path": request.path}), 404


@app.errorhandler(500)
def handle_500(e):
    return jsonify({
        "error": "Terjadi kesalahan internal server.",
        "detail": [str(e)]
    }), 500


@app.errorhandler(Exception)
def handle_exception(e):
    return jsonify({
        "error": "Terjadi kesalahan pada pemrosesan permintaan.",
        "detail": [str(e)]
    }), 500


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
            "aman": round((1.0 - proba_darurat) * 100.0, 2),
            "darurat": round(proba_darurat * 100.0, 2),
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
    return app.send_static_file("index.html")


@app.before_request
def require_model():
    if request.method == "POST" and MODEL is None:
        return jsonify({
            "error": "Model belum tersedia.",
            "log": MODEL_LOAD_LOG
        }), 503


@app.route("/api/health", methods=["GET"])
@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "model_loaded": MODEL is not None,
        "model_source": MODEL_SOURCE,
        "python_version": sys.version,
        "log": MODEL_LOAD_LOG
    })


@app.route("/api/model-info", methods=["GET"])
@app.route("/model-info", methods=["GET"])
def model_info():
    info_clean = {k: v for k, v in MODEL_INFO.items() if k != "model_params"}
    return jsonify({
        "features": FEATURES,
        "limits": LIMITS,
        "model_source": MODEL_SOURCE,
        **info_clean
    })


@app.route("/api/predict", methods=["POST"])
@app.route("/predict", methods=["POST"])
def predict():
    payload = request.get_json(silent=True)
    if payload is None:
        return jsonify({"error": "Body JSON tidak valid atau kosong."}), 400

    point, errors = validate_point(payload)
    if errors:
        return jsonify({"error": "Input tidak valid", "detail": errors}), 400
    return jsonify(predict_points([point])[0])


@app.route("/api/predict-batch", methods=["POST"])
@app.route("/predict-batch", methods=["POST"])
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
