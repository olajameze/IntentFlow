"""Stripe revenue aggregation tools."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import stripe


def fetch_stripe_balance(stripe_key: str) -> dict[str, Any]:
    stripe.api_key = stripe_key
    bal = stripe.Balance.retrieve()
    return {"object": bal.to_dict()}


def fetch_stripe_transactions(stripe_key: str, start: datetime | None, end: datetime | None) -> list[dict[str, Any]]:
    stripe.api_key = stripe_key
    params: dict[str, Any] = {"limit": 100}
    if start:
        params["created"] = {"gte": int(start.timestamp())}
    if end:
        params.setdefault("created", {})
        if not isinstance(params["created"], dict):
            params["created"] = {}
        params["created"]["lte"] = int(end.timestamp())

    rows: list[dict[str, Any]] = []
    for tx in stripe.BalanceTransaction.list(**params).auto_paging_iter():
        rows.append(tx.to_dict())
    return rows


def calculate_mrr(stripe_key: str) -> dict[str, Any]:
    """Approximate MRR from active subscriptions (Stripe API)."""
    stripe.api_key = stripe_key
    total = 0.0
    for sub in stripe.Subscription.list(status="active", limit=100).auto_paging_iter():
        items = getattr(sub, "items", None)
        data = getattr(items, "data", []) if items else []
        for it in data:
            price = getattr(it, "price", None)
            if not price:
                continue
            unit = float(getattr(price, "unit_amount", 0) or 0) / 100.0
            recurring = getattr(price, "recurring", None)
            interval = getattr(recurring, "interval", None) if recurring else None
            if interval == "month":
                total += unit
            elif interval == "year":
                total += unit / 12.0
    return {"mrr_estimate": round(total, 2)}


def fetch_stripe_revenue(stripe_key: str, date_range: tuple[datetime, datetime] | None = None) -> dict[str, Any]:
    start, end = date_range or (
        datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0),
        datetime.now(timezone.utc),
    )
    txs = fetch_stripe_transactions(stripe_key, start, end)
    gross = 0.0
    fees = 0.0
    net = 0.0
    for tx in txs:
        gross += float(tx.get("amount", 0)) / 100.0
        fees += float(tx.get("fee", 0)) / 100.0
        net += float(tx.get("net", 0)) / 100.0

    balance = fetch_stripe_balance(stripe_key)
    mrr = calculate_mrr(stripe_key)
    return {
        "window": {"start": start.isoformat(), "end": end.isoformat()},
        "transactions": len(txs),
        "total_gross": round(gross, 2),
        "total_fees": round(fees, 2),
        "total_net": round(net, 2),
        "balance": balance,
        "mrr": mrr.get("mrr_estimate", 0),
    }
