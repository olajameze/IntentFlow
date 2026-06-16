"""Social listening v1 — CSV/RSS feed import into outreach prospects pipeline.

Avoids ToS-risk scraping. Engine posts approved rows to the dashboard
``/api/outreach/social-signals`` endpoint for operator review.
"""

from __future__ import annotations

import csv
import json
import os
import sys
from pathlib import Path
from typing import Any

import httpx

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))


def _dashboard_url() -> str:
    return (
        os.environ.get("OUTREACH_DASHBOARD_URL")
        or os.environ.get("OUTREACH_PUBLIC_BASE_URL")
        or "http://localhost:3000"
    ).rstrip("/")


def _cron_headers() -> dict[str, str]:
    secret = os.environ.get("CRON_SECRET", "").strip()
    if secret:
        return {"Authorization": f"Bearer {secret}"}
    return {}


def load_csv_rows(path: str | Path) -> list[dict[str, Any]]:
    """Parse CSV with columns: name, email, website_url, campaign."""
    rows: list[dict[str, Any]] = []
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            email = (row.get("email") or "").strip().lower()
            if not email:
                continue
            rows.append(
                {
                    "name": (row.get("name") or email.split("@")[0]).strip(),
                    "email": email,
                    "website_url": (row.get("website_url") or "").strip() or None,
                    "campaign": (row.get("campaign") or "jgdevs").strip().lower(),
                }
            )
    return rows


def import_social_signals(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """POST rows to dashboard social-signals API."""
    url = f"{_dashboard_url()}/api/outreach/social-signals"
    with httpx.Client(timeout=60.0) as client:
        res = client.post(url, json={"rows": rows}, headers=_cron_headers())
        res.raise_for_status()
        return res.json()


def run_from_csv(csv_path: str | Path) -> dict[str, Any]:
    rows = load_csv_rows(csv_path)
    if not rows:
        return {"ok": True, "inserted": 0, "message": "No rows in CSV"}
    return import_social_signals(rows)


def run_from_json_feed(feed_path: str | Path) -> dict[str, Any]:
    """Load JSON array of {name, email, website_url, campaign}."""
    data = json.loads(Path(feed_path).read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError("Feed must be a JSON array")
    return import_social_signals(data)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Import social listening signals")
    parser.add_argument("path", help="CSV or JSON feed path")
    parser.add_argument("--format", choices=["csv", "json"], default="csv")
    args = parser.parse_args()
    if args.format == "json":
        print(run_from_json_feed(args.path))
    else:
        print(run_from_csv(args.path))
