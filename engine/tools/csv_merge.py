"""Merge payment CSV exports into a normalized ledger (pandas)."""

from __future__ import annotations

import io
from pathlib import Path
from typing import Any

import pandas as pd


KNOWN_COLUMNS = {
    "stripe": ["created", "amount", "fee", "net", "currency", "description"],
    "paypal": ["date", "gross", "fee", "net", "currency", "description"],
    "gumroad": ["purchase date", "gross", "fee", "net", "currency", "name"],
}


def merge_payment_ledger(files: dict[str, str | Path]) -> list[dict[str, Any]]:
    """
    files: mapping processor -> path string.
    Returns unified rows: { processor, date, gross, fee, net, currency, description }
    """
    frames: list[pd.DataFrame] = []
    for processor, path in files.items():
        raw = Path(path).read_bytes()
        df = pd.read_csv(io.BytesIO(raw))
        df.columns = [c.strip().lower() for c in df.columns]
        normalized = _normalize_processor_df(processor, df)
        frames.append(normalized)

    if not frames:
        return []

    all_df = pd.concat(frames, ignore_index=True)
    return all_df.to_dict(orient="records")


def _normalize_processor_df(processor: str, df: pd.DataFrame) -> pd.DataFrame:
    p = processor.lower()
    if p == "stripe" and "amount" in df.columns:
        out = pd.DataFrame(
            {
                "processor": "stripe",
                "date": pd.to_datetime(df.get("created", df.get("date")), utc=True, errors="coerce"),
                "gross": pd.to_numeric(df.get("amount", 0), errors="coerce").fillna(0) / 100.0,
                "fee": pd.to_numeric(df.get("fee", 0), errors="coerce").fillna(0) / 100.0,
                "net": pd.to_numeric(df.get("net", 0), errors="coerce").fillna(0) / 100.0,
                "currency": df.get("currency", "usd").fillna("usd"),
                "description": df.get("description", "").fillna(""),
            }
        )
        return out

    if p == "paypal" and "gross" in df.columns:
        out = pd.DataFrame(
            {
                "processor": "paypal",
                "date": pd.to_datetime(df.get("date"), utc=True, errors="coerce"),
                "gross": pd.to_numeric(df.get("gross", 0), errors="coerce").fillna(0),
                "fee": pd.to_numeric(df.get("fee", 0), errors="coerce").fillna(0),
                "net": pd.to_numeric(df.get("net", 0), errors="coerce").fillna(0),
                "currency": df.get("currency", "usd").fillna("usd"),
                "description": df.get("description", "").fillna(""),
            }
        )
        return out

    if "gross" in df.columns:
        out = pd.DataFrame(
            {
                "processor": processor,
                "date": pd.to_datetime(
                    df.get("purchase date", df.get("date")), utc=True, errors="coerce"
                ),
                "gross": pd.to_numeric(df.get("gross", 0), errors="coerce").fillna(0),
                "fee": pd.to_numeric(df.get("fee", 0), errors="coerce").fillna(0),
                "net": pd.to_numeric(df.get("net", 0), errors="coerce").fillna(0),
                "currency": df.get("currency", "usd").fillna("usd"),
                "description": df.get("name", df.get("description", "")).fillna(""),
            }
        )
        return out

    # Fallback: attempt generic
    return pd.DataFrame(
        {
            "processor": processor,
            "date": pd.to_datetime(df.iloc[:, 0], utc=True, errors="coerce"),
            "gross": pd.to_numeric(df.iloc[:, 1], errors="coerce").fillna(0),
            "fee": 0.0,
            "net": pd.to_numeric(df.iloc[:, 1], errors="coerce").fillna(0),
            "currency": "usd",
            "description": "",
        }
    )


def merge_csv_uploads(file_map: dict[str, str | Path]) -> list[dict[str, Any]]:
    """Alias used by agent tooling."""
    return merge_payment_ledger(file_map)
