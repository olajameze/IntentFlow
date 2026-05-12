"""Persist analytics and revenue snapshots to Supabase."""

from __future__ import annotations

import sys
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from supabase_client import get_supabase


def save_traffic_snapshot(business_id: str | None, data: dict[str, Any], source: str, website_id: str | None = None) -> None:
    sb = get_supabase()
    payload = {
        "business_id": business_id,
        "source": source,
        "website_id": website_id,
        "domain": data.get("domain"),
        "payload": data,
        "captured_at": datetime.now(timezone.utc).isoformat(),
    }
    sb.table("analytics_snapshots").insert(payload).execute()


def save_revenue_snapshot(business_id: str, data: dict[str, Any], snapshot_source: str = "stripe_api") -> None:
    sb = get_supabase()
    today = date.today()
    row = {
        "business_id": business_id,
        "snapshot_date": today.isoformat(),
        "total_revenue": float(data.get("total_gross") or data.get("total_revenue") or 0),
        "total_fees": float(data.get("total_fees") or 0),
        "net_revenue": float(data.get("total_net") or data.get("net_revenue") or 0),
        "mrr": float(data.get("mrr") or 0),
        "transaction_count": int(data.get("transactions") or data.get("transaction_count") or 0),
        "new_customers": data.get("new_customers"),
        "churn_rate": data.get("churn_rate"),
        "source": snapshot_source,
        "raw": data,
    }
    sb.table("revenue_snapshots").upsert(row, on_conflict="business_id,snapshot_date,source").execute()
