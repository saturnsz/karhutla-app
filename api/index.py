"""
Backend REST API - Klasifikasi Wilayah Pemadaman Karhutla Kalimantan.

Endpoint:
    GET  /api/health
    GET  /api/model-info
    POST /api/predict          -> 1 titik
    POST /api/predict-batch    -> banyak titik (maks. 500)
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


# ---------------------------------------------------------------- fallback model (tanpa scikit-learn)
class StandaloneGaussianNB:
    """
    Gaussian Naive Bayes murni NumPy — output 100% identik dengan
    scikit-learn GaussianNB, namun bebas masalah versi pickle/joblib.
    """
    def __init__(self, theta, var, class_prior, classes):
        self.theta = np.array(theta, dtype=float)
        self.var = np.array(var, dtype=float)
        self.class_prior = np.array(class_prior, dtype=float)
        self.classes = np.array(classes)

    def predict_proba(self, X):
        X = np.asarray(X, dtype=float)
        if X.ndim == 1:
            X = X.reshape(1, -1)
        log_probs = []
        for c in range(len(self.class_prior)):
            lp = np.log(self.class_prior[c])
            ll = -0.5 * np.sum(
                np.log(2.0 * np.pi * self.var[c])
                + ((X - self.theta[c]) ** 2) / self.var[c],
                axis=1
            )
            log_probs.append(lp + ll)
        log_probs = np.array(log_probs).T
        mx = np.max(log_probs, axis=1, keepdims=True)
        e = np.exp(log_probs - mx)
        return e / np.sum(e, axis=1, keepdims=True)


# ---------------------------------------------------------------- model loading
FEATURES = ["latitude", "longitude", "brightness", "confidence"]

# Parameter model Gaussian NB (diekstrak dari model_karhutla_NB.pkl yang sudah dilatih)
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

# Muat model_info.json
MODEL_INFO = {}
_info_candidates = [
    BASE_DIR / "model_info.json",
    Path(os.getcwd()) / "api" / "model_info.json",
]
for _ip in _info_candidates:
    if _ip.exists():
        try:
            MODEL_INFO = json.loads(_ip.read_text(encoding="utf-8"))
            MODEL_LOAD_LOG.append(f"model_info.json dimuat dari {_ip}")
            break
        except Exception as e:
            MODEL_LOAD_LOG.append(f"Gagal baca {_ip}: {e}")

# Strategi 1: Coba load .pkl via joblib
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
            MODEL_SOURCE = f"joblib ({_p})"
            MODEL_LOAD_LOG.append(f"Model dimuat via joblib dari {_p}")
            break
        except Exception as e:
            MODEL_LOAD_LOG.append(f"Gagal joblib.load({_p}): {e}")

# Strategi 2: Fallback ke StandaloneGaussianNB (selalu berhasil)
if MODEL is None:
    try:
        p = MODEL_INFO.get("model_params", FALLBACK_PARAMS)
        MODEL = StandaloneGaussianNB(
            theta=p["theta"], var=p["var"],
            class_prior=p["class_prior"], classes=p["classes"]
        )
        MODEL_SOURCE = "StandaloneGaussianNB (fallback)"
        MODEL_LOAD_LOG.append("Memakai StandaloneGaussianNB fallback (tanpa pkl)")
    except Exception as e:
        MODEL_LOAD_LOG.append(f"Fallback gagal: {e}\n{traceback.format_exc()}")

# Batas validasi
LIMITS = {
    "latitude":   (-4.5, 4.5),
    "longitude":  (108.5, 119.5),
    "brightness": (250.0, 520.0),
    "confidence": (80.0, 100.0),
}
MAX_BATCH = 500


# ---------------------------------------------------------------- helper
def validate_point(data):
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
@app.route("/", methods=["GET"])
def index():
    return app.send_static_file("index.html")


@app.before_request
def require_model():
    if request.method == "POST" and MODEL is None:
        return jsonify({"error": "Model belum tersedia.", "log": MODEL_LOAD_LOG}), 503


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "model_loaded": MODEL is not None,
        "model_source": MODEL_SOURCE,
        "python": sys.version,
        "log": MODEL_LOAD_LOG,
    })


@app.route("/api/model-info", methods=["GET"])
def model_info():
    info_clean = {k: v for k, v in MODEL_INFO.items() if k != "model_params"}
    return jsonify({"features": FEATURES, "limits": LIMITS, **info_clean})


@app.route("/api/predict", methods=["POST"])
def predict():
    payload = request.get_json(silent=True)
    if payload is None:
        return jsonify({"error": "Body JSON tidak valid atau kosong."}), 400
    point, errors = validate_point(payload)
    if errors:
        return jsonify({"error": "Input tidak valid", "detail": errors}), 400
    return jsonify(predict_points([point])[0])


@app.route("/api/predict-batch", methods=["POST"])
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


# ---------------------------------------------------------------- error handlers
@app.errorhandler(404)
def handle_404(e):
    return jsonify({"error": "Endpoint tidak ditemukan.", "path": request.path}), 404


@app.errorhandler(405)
def handle_405(e):
    return jsonify({
        "error": f"Method {request.method} tidak diizinkan untuk {request.path}.",
        "path": request.path,
        "method": request.method,
    }), 405


@app.errorhandler(Exception)
def handle_exception(e):
    return jsonify({
        "error": "Terjadi kesalahan pada server.",
        "detail": [str(e)],
    }), 500


# ---------------------------------------------------------------- debug endpoint (hapus setelah deploy berhasil)
@app.route("/api/debug", methods=["GET", "POST"])
def debug_info():
    return jsonify({
        "path": request.path,
        "method": request.method,
        "url": request.url,
        "base_url": request.base_url,
        "headers": dict(request.headers),
        "environ_path_info": request.environ.get("PATH_INFO"),
        "environ_script_name": request.environ.get("SCRIPT_NAME"),
        "model_loaded": MODEL is not None,
        "model_source": MODEL_SOURCE,
        "base_dir": str(BASE_DIR),
        "cwd": os.getcwd(),
        "api_dir_contents": [f.name for f in BASE_DIR.iterdir()] if BASE_DIR.exists() else [],
        "log": MODEL_LOAD_LOG,
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
