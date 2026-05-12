"""Umami Analytics REST client (self-hosted)."""

from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path
from typing import Any

import httpx

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from config import umami_api_token, umami_url


def _headers() -> dict[str, str]:
    token = umami_api_token()
    if not token:
        raise RuntimeError("UMAMI_API_TOKEN is not configured")
    return {"Authorization": f"Bearer {token}", "Accept": "application/json"}


def fetch_umami_stats(website_id: str, start_at: datetime, end_at: datetime) -> dict[str, Any]:
    base = (umami_url() or "").rstrip("/")
    if not base:
        raise RuntimeError("UMAMI_URL is not configured")
    params = {
        "startAt": int(start_at.timestamp() * 1000),
        "endAt": int(end_at.timestamp() * 1000),
    }
    url = f"{base}/api/websites/{website_id}/stats"
    with httpx.Client(timeout=60) as client:
        r = client.get(url, headers=_headers(), params=params)
        r.raise_for_status()
        return r.json()


def fetch_umami_pageviews(website_id: str, start_at: datetime, end_at: datetime) -> dict[str, Any]:
    base = (umami_url() or "").rstrip("/")
    if not base:
        raise RuntimeError("UMAMI_URL is not configured")
    params = {
        "startAt": int(start_at.timestamp() * 1000),
        "endAt": int(end_at.timestamp() * 1000),
        "unit": "day",
    }
    url = f"{base}/api/websites/{website_id}/pageviews"
    with httpx.Client(timeout=60) as client:
        r = client.get(url, headers=_headers(), params=params)
        r.raise_for_status()
        return r.json()


def fetch_umami_metrics(website_id: str, start_at: datetime, end_at: datetime) -> dict[str, Any]:
    """Browsers, countries, devices — Umami exposes /metrics with query params."""
    base = (umami_url() or "").rstrip("/")
    if not base:
        raise RuntimeError("UMAMI_URL is not configured")
    params = {
        "startAt": int(start_at.timestamp() * 1000),
        "endAt": int(end_at.timestamp() * 1000),
    }
    url = f"{base}/api/websites/{website_id}/metrics"
    with httpx.Client(timeout=60) as client:
        r = client.get(url, headers=_headers(), params=params)
        r.raise_for_status()
        return r.json()


def fetch_umami_events(website_id: str, start_at: datetime, end_at: datetime) -> dict[str, Any]:
    base = (umami_url() or "").rstrip("/")
    if not base:
        raise RuntimeError("UMAMI_URL is not configured")
    params = {
        "startAt": int(start_at.timestamp() * 1000),
        "endAt": int(end_at.timestamp() * 1000),
    }
    url = f"{base}/api/websites/{website_id}/events"
    with httpx.Client(timeout=60) as client:
        r = client.get(url, headers=_headers(), params=params)
        r.raise_for_status()
        return r.json()
