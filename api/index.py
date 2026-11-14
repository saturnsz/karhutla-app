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
