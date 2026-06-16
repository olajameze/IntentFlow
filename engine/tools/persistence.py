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

_UPSERT_BATCH = 100


def stripe_transaction_to_entry(business_id: str, tx: dict[str, Any]) -> dict[str, Any] | None:
    """Map a Stripe balance transaction dict to a revenue_entries row."""
    tx_id = tx.get("id")
    if not tx_id:
        return None
    created = tx.get("created")
    if created:
        entry_date = datetime.fromtimestamp(int(created), tz=timezone.utc).date().isoformat()
    else:
        entry_date = date.today().isoformat()
    amount = round(float(tx.get("amount", 0)) / 100.0, 2)
    fee = round(float(tx.get("fee", 0)) / 100.0, 2)
    net = round(float(tx.get("net", 0)) / 100.0, 2)
    currency = str(tx.get("currency") or "gbp").upper()
    desc = (tx.get("description") or tx.get("type") or "Stripe transaction").strip()
    return {
        "business_id": business_id,
        "amount": amount,
        "currency": currency,
        "source": "stripe",
        "source_transaction_id": str(tx_id),
        "fees": fee,
        "net_amount": net,
        "description": desc,
        "entry_date": entry_date,
    }


def sync_stripe_revenue_entries(business_id: str, transactions: list[dict[str, Any]]) -> int:
    """Upsert Stripe balance transactions into revenue_entries. Returns rows upserted."""
    rows = [row for tx in transactions if (row := stripe_transaction_to_entry(business_id, tx))]
    if not rows:
        return 0
    sb = get_supabase()
    synced = 0
    for i in range(0, len(rows), _UPSERT_BATCH):
        batch = rows[i : i + _UPSERT_BATCH]
        sb.table("revenue_entries").upsert(
            batch,
            on_conflict="business_id,source_transaction_id",
        ).execute()
        synced += len(batch)
    return synced


def persist_stripe_revenue(
    business_id: str,
    data: dict[str, Any],
    *,
    snapshot_source: str = "stripe_api",
    sync_entries: bool = True,
) -> int:
    """Save aggregated snapshot and optionally upsert transaction-level revenue_entries."""
    save_revenue_snapshot(business_id, data, snapshot_source=snapshot_source)
    if not sync_entries:
        return 0
    txs = data.get("transaction_rows")
    if not isinstance(txs, list):
        return 0
    return sync_stripe_revenue_entries(business_id, txs)


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
