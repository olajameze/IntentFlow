"""Stripe revenue entry mapping tests."""

from __future__ import annotations

import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from tools.persistence import stripe_transaction_to_entry


def test_stripe_transaction_to_entry_maps_charge():
    row = stripe_transaction_to_entry(
        "11111111-1111-1111-1111-111111111111",
        {
            "id": "txn_abc123",
            "amount": 5000,
            "fee": 145,
            "net": 4855,
            "currency": "gbp",
            "created": 1718409600,
            "description": "Booking deposit",
            "type": "charge",
        },
    )
    assert row is not None
    assert row["business_id"] == "11111111-1111-1111-1111-111111111111"
    assert row["source_transaction_id"] == "txn_abc123"
    assert row["amount"] == 50.0
    assert row["fees"] == 1.45
    assert row["net_amount"] == 48.55
    assert row["currency"] == "GBP"
    assert row["source"] == "stripe"
    assert row["entry_date"] == "2024-06-15"
    assert row["description"] == "Booking deposit"


def test_stripe_transaction_to_entry_skips_missing_id():
    assert stripe_transaction_to_entry("11111111-1111-1111-1111-111111111111", {"amount": 100}) is None


def test_stripe_transaction_to_entry_refund_negative():
    row = stripe_transaction_to_entry(
        "22222222-2222-2222-2222-222222222222",
        {
            "id": "txn_refund1",
            "amount": -2500,
            "fee": 0,
            "net": -2500,
            "currency": "usd",
            "created": 1718409600,
            "type": "refund",
        },
    )
    assert row is not None
    assert row["amount"] == -25.0
    assert row["description"] == "refund"
