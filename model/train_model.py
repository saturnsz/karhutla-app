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
