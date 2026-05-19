"""
XGBoost baseline risk classifier for E-Rate denial prediction.
Trained on denial-hunter export data (USAC FCDL decisions).

Usage:
    python -m app.services.compliance.ml.train_baseline [--csv PATH]

Advisory only. Not legal or USAC official guidance.
"""

import argparse
import json
import logging
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.model_selection import StratifiedKFold, train_test_split
from sklearn.metrics import (
    roc_auc_score,
    average_precision_score,
    accuracy_score,
    precision_recall_fscore_support,
    confusion_matrix,
)
from sklearn.preprocessing import LabelEncoder
import xgboost as xgb

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

ARTIFACTS_DIR = Path(__file__).parent / "artifacts"
ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)

# Columns to drop (leakers and identifiers)
LEAKER_COLS = ["appealability_score", "outreach_sent"]
ID_COLS = ["ben", "frn"]

# Feature config
CATEGORICAL_COLS = ["state", "applicant_type", "service_type", "category"]
NUMERIC_COLS = [
    "discount_rate", "requested_amount", "funding_year",
    "months_of_service", "wave_sequence_number",
]
BOOL_COLS = ["is_consortium", "is_certified_in_window", "spac_filed", "was_form_470_posted"]

TARGET = "label"


def target_encode_col(train_series, train_y, val_series, smoothing=10):
    """K-fold safe target encoding with global mean smoothing."""
    global_mean = train_y.mean()
    stats = train_y.groupby(train_series).agg(["mean", "count"])
    smoother = stats["count"] / (stats["count"] + smoothing)
    encoded_map = smoother * stats["mean"] + (1 - smoother) * global_mean
    train_encoded = train_series.map(encoded_map).fillna(global_mean)
    val_encoded = val_series.map(encoded_map).fillna(global_mean)
    return train_encoded, val_encoded, encoded_map


def prepare_features(df):
    """Feature engineering pipeline."""
    df = df.copy()

    # Numeric imputation
    df["discount_rate"] = pd.to_numeric(df["discount_rate"], errors="coerce")
    df["discount_rate"].fillna(df["discount_rate"].median(), inplace=True)

    df["requested_amount"] = pd.to_numeric(df["requested_amount"], errors="coerce").fillna(0)
    df["requested_amount_log"] = np.log1p(df["requested_amount"])

    df["funding_year"] = pd.to_numeric(df["funding_year"], errors="coerce").fillna(2026).astype(int)

    for col in ["months_of_service", "wave_sequence_number"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")
        df[col].fillna(df[col].median(), inplace=True)

    # Booleans
    for col in BOOL_COLS:
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0).astype(int)

    return df


def build_feature_matrix(df_train, df_val, y_train):
    """Build feature matrix with target encoding for categoricals."""
    feature_cols = []
    encoders = {}

    # Numeric features
    num_features = ["discount_rate", "requested_amount_log", "funding_year",
                    "months_of_service", "wave_sequence_number"] + BOOL_COLS
    feature_cols.extend(num_features)

    # Target-encode categoricals
    for col in CATEGORICAL_COLS:
        n_unique = df_train[col].nunique()
        if n_unique < 10:
            # One-hot for low cardinality
            dummies_train = pd.get_dummies(df_train[col], prefix=col, dummy_na=True)
            dummies_val = pd.get_dummies(df_val[col], prefix=col, dummy_na=True)
            # Align columns
            for c in dummies_train.columns:
                if c not in dummies_val.columns:
                    dummies_val[c] = 0
            for c in dummies_val.columns:
                if c not in dummies_train.columns:
                    dummies_train[c] = 0
            dummies_val = dummies_val[dummies_train.columns]
            df_train = pd.concat([df_train, dummies_train], axis=1)
            df_val = pd.concat([df_val, dummies_val], axis=1)
            feature_cols.extend(dummies_train.columns.tolist())
            encoders[col] = {"type": "onehot", "columns": dummies_train.columns.tolist()}
        else:
            # Target encode
            enc_name = f"{col}_te"
            train_enc, val_enc, enc_map = target_encode_col(
                df_train[col], y_train, df_val[col]
            )
            df_train[enc_name] = train_enc
            df_val[enc_name] = val_enc
            feature_cols.append(enc_name)
            encoders[col] = {"type": "target", "map": {str(k): float(v) for k, v in enc_map.items()}}

    X_train = df_train[feature_cols].astype(np.float32)
    X_val = df_val[feature_cols].astype(np.float32)

    return X_train, X_val, feature_cols, encoders


def train_model(csv_path: str):
    """Train XGBoost baseline and save artifacts."""
    logger.info("Loading data from %s", csv_path)
    df = pd.read_csv(csv_path, comment="#")
    logger.info("Loaded %d rows, %d columns", len(df), len(df.columns))
    logger.info("Label distribution: %s", df[TARGET].value_counts().to_dict())

    # Drop leakers and IDs
    df_ids = df[ID_COLS].copy()
    df = df.drop(columns=[c for c in LEAKER_COLS + ID_COLS if c in df.columns], errors="ignore")

    # Feature engineering
    df = prepare_features(df)

    # Stratified split: 70/15/15
    y = df[TARGET].astype(int)
    df_trainval, df_test, y_trainval, y_test = train_test_split(
        df, y, test_size=0.15, stratify=y, random_state=42
    )
    df_train, df_val, y_train, y_val = train_test_split(
        df_trainval, y_trainval, test_size=0.1765, stratify=y_trainval, random_state=42
    )
    # 0.1765 of 0.85 ~= 0.15

    logger.info("Split sizes: train=%d, val=%d, test=%d", len(df_train), len(df_val), len(df_test))

    # Build features
    X_train, X_val, feature_cols, encoders = build_feature_matrix(
        df_train.reset_index(drop=True),
        df_val.reset_index(drop=True),
        y_train.reset_index(drop=True),
    )

    # Also build test features (use train encoders)
    df_test_prep = df_test.reset_index(drop=True)
    _, X_test, _, _ = build_feature_matrix(
        df_train.reset_index(drop=True),
        df_test_prep,
        y_train.reset_index(drop=True),
    )

    # XGBoost training
    params = {
        "objective": "binary:logistic",
        "eval_metric": "logloss",
        "scale_pos_weight": 3.0,
        "max_depth": 4,
        "n_estimators": 200,
        "learning_rate": 0.05,
        "subsample": 0.8,
        "colsample_bytree": 0.8,
        "random_state": 42,
        "verbosity": 0,
    }

    model = xgb.XGBClassifier(**params, early_stopping_rounds=20)
    model.fit(
        X_train, y_train.reset_index(drop=True),
        eval_set=[(X_val, y_val.reset_index(drop=True))],
        verbose=False,
    )

    best_iteration = model.best_iteration
    logger.info("Best iteration: %d", best_iteration)

    # 5-fold CV on train
    cv_aucs = []
    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    for fold_train_idx, fold_val_idx in skf.split(X_train, y_train.reset_index(drop=True)):
        fold_model = xgb.XGBClassifier(**{**params, "n_estimators": best_iteration + 1})
        fold_model.fit(X_train.iloc[fold_train_idx], y_train.reset_index(drop=True).iloc[fold_train_idx], verbose=False)
        fold_preds = fold_model.predict_proba(X_train.iloc[fold_val_idx])[:, 1]
        cv_aucs.append(roc_auc_score(y_train.reset_index(drop=True).iloc[fold_val_idx], fold_preds))

    logger.info("5-fold CV AUC: %.4f +/- %.4f", np.mean(cv_aucs), np.std(cv_aucs))

    # Test set evaluation
    y_test_reset = y_test.reset_index(drop=True)
    y_prob = model.predict_proba(X_test)[:, 1]

    auc = roc_auc_score(y_test_reset, y_prob)
    pr_auc = average_precision_score(y_test_reset, y_prob)

    metrics = {
        "model": "XGBoost baseline v1",
        "n_train": int(len(X_train)),
        "n_val": int(len(X_val)),
        "n_test": int(len(X_test)),
        "best_iteration": int(best_iteration),
        "cv_auc_mean": round(float(np.mean(cv_aucs)), 4),
        "cv_auc_std": round(float(np.std(cv_aucs)), 4),
        "test_auc": round(float(auc), 4),
        "test_pr_auc": round(float(pr_auc), 4),
        "thresholds": {},
    }

    for threshold in [0.3, 0.5, 0.7]:
        y_pred = (y_prob >= threshold).astype(int)
        acc = accuracy_score(y_test_reset, y_pred)
        prec, rec, f1, _ = precision_recall_fscore_support(y_test_reset, y_pred, average="binary", zero_division=0)
        cm = confusion_matrix(y_test_reset, y_pred).tolist()
        metrics["thresholds"][str(threshold)] = {
            "accuracy": round(float(acc), 4),
            "precision": round(float(prec), 4),
            "recall": round(float(rec), 4),
            "f1": round(float(f1), 4),
            "confusion_matrix": cm,
        }

    # Feature importances (gain)
    importance_dict = model.get_booster().get_score(importance_type="gain")
    imp_df = pd.DataFrame([
        {"feature": k, "gain": round(v, 4)} for k, v in importance_dict.items()
    ]).sort_values("gain", ascending=False).head(15)

    # Print results
    logger.info("=" * 60)
    logger.info("TEST SET METRICS")
    logger.info("=" * 60)
    logger.info("AUC-ROC: %.4f", auc)
    logger.info("PR-AUC:  %.4f", pr_auc)
    for t, m in metrics["thresholds"].items():
        logger.info("@%.1f => Acc=%.4f Prec=%.4f Rec=%.4f F1=%.4f", float(t), m["accuracy"], m["precision"], m["recall"], m["f1"])
    logger.info("-" * 60)
    logger.info("Top-15 Feature Importances (gain):")
    for _, row in imp_df.iterrows():
        logger.info("  %-35s %.4f", row["feature"], row["gain"])

    # Save artifacts
    model_path = ARTIFACTS_DIR / "baseline_v1.json"
    model.save_model(str(model_path))
    logger.info("Model saved: %s", model_path)

    schema = {
        "feature_columns": feature_cols,
        "categorical_encoders": encoders,
        "params": params,
        "target": TARGET,
    }
    schema_path = ARTIFACTS_DIR / "baseline_v1_schema.json"
    with open(schema_path, "w") as f:
        json.dump(schema, f, indent=2, default=str)
    logger.info("Schema saved: %s", schema_path)

    metrics_path = ARTIFACTS_DIR / "baseline_v1_metrics.json"
    with open(metrics_path, "w") as f:
        json.dump(metrics, f, indent=2)
    logger.info("Metrics saved: %s", metrics_path)

    imp_path = ARTIFACTS_DIR / "baseline_v1_importances.csv"
    imp_df.to_csv(imp_path, index=False)
    logger.info("Importances saved: %s", imp_path)

    return metrics


def main():
    parser = argparse.ArgumentParser(description="Train XGBoost baseline risk classifier")
    default_csv = str(Path(__file__).parent.parent.parent.parent.parent.parent.parent / "denial-hunter" / "exports" / "training_data_2026-05-19.csv")
    parser.add_argument("--csv", default=default_csv, help="Path to training CSV")
    args = parser.parse_args()

    if not Path(args.csv).exists():
        logger.error("CSV not found: %s", args.csv)
        sys.exit(1)

    train_model(args.csv)


if __name__ == "__main__":
    main()
