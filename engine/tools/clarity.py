"""Microsoft Clarity Data Export API client."""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any

import httpx

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

CLARITY_EXPORT_URL = "https://www.clarity.ms/export-data/api/v1/project-live-insights"


def clarity_api_token_from_env() -> str | None:
    token = os.getenv("CLARITY_API_TOKEN", "").strip()
    return token or None


def resolve_clarity_api_token(explicit: str | None = None) -> str:
    token = (explicit or "").strip() or (clarity_api_token_from_env() or "")
    if not token:
        raise RuntimeError(
            "Clarity API token missing — save per-brand token in Settings or set CLARITY_API_TOKEN."
        )
    return token


def clarity_api_token() -> str:
    """Backward-compatible env-only accessor."""
    return resolve_clarity_api_token(None)


def clarity_snapshot_days() -> int:
    raw = os.getenv("CLARITY_SNAPSHOT_DAYS", "3").strip()
    try:
        days = int(raw)
    except ValueError:
        days = 3
    return max(1, min(3, days))


def _parse_count(raw: Any) -> int:
    if isinstance(raw, bool):
        return 0
    if isinstance(raw, (int, float)):
        return int(raw)
    if isinstance(raw, str) and raw.strip().isdigit():
        return int(raw.strip())
    try:
        return int(float(raw))
    except (TypeError, ValueError):
        return 0


def _totals_from_metrics(metrics: Any) -> dict[str, int]:
    sessions = 0
    users = 0
    if not isinstance(metrics, list):
        return {"sessions": 0, "users": 0}
    for block in metrics:
        if not isinstance(block, dict):
            continue
        if str(block.get("metricName", "")).lower() != "traffic":
            continue
        for row in block.get("information") or []:
            if not isinstance(row, dict):
                continue
            sessions += _parse_count(row.get("totalSessionCount"))
            users += _parse_count(row.get("distantUserCount") or row.get("distinctUserCount"))
    return {"sessions": sessions, "users": users}


def fetch_clarity_live_insights(
    project_id: str,
    num_of_days: int | None = None,
    api_token: str | None = None,
) -> dict[str, Any]:
    pid = (project_id or "").strip()
    if not pid:
        raise ValueError("clarity_project_id is required")
    days = num_of_days if num_of_days is not None else clarity_snapshot_days()
    days = max(1, min(3, int(days)))

    params = {"projectId": pid, "numOfDays": str(days)}
    headers = {
        "Authorization": f"Bearer {resolve_clarity_api_token(api_token)}",
        "Content-Type": "application/json",
    }
    with httpx.Client(timeout=60) as client:
        r = client.get(CLARITY_EXPORT_URL, headers=headers, params=params)
        r.raise_for_status()
        metrics = r.json()

    totals = _totals_from_metrics(metrics)
    return {
        "metrics": metrics,
        "clarity_project_id": pid,
        "numOfDays": days,
        "totals": totals,
        "sessions": totals["sessions"],
        "users": totals["users"],
    }
