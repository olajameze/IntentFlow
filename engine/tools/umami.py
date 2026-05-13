"""Umami Analytics REST client (self-hosted JWT or Umami Cloud API key).

Self-hosted (default): ``UMAMI_URL`` + ``Authorization: Bearer <JWT>`` at
``{UMAMI_URL}/api/websites/{id}/stats``.

Umami Cloud: use ``https://api.umami.is/v1`` + header ``x-umami-api-key`` at
``{endpoint}/websites/{id}/stats``. If ``UMAMI_URL`` is the Cloud dashboard
(``https://cloud.umami.is``), the client switches automatically when
``UMAMI_API_KEY`` or ``UMAMI_API_TOKEN`` holds your **Cloud API key** (not a
session JWT). See https://docs.umami.is/docs/cloud/api-key
"""

from __future__ import annotations

import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Literal

import httpx

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from config import umami_api_client_endpoint, umami_api_key, umami_api_token, umami_url

AuthKind = Literal["cloud_key", "bearer"]
LayoutKind = Literal["client", "legacy"]


def _resolve_umami_target() -> tuple[str, LayoutKind, AuthKind]:
    """Returns (api_base_url, path layout, auth kind)."""
    explicit = umami_api_client_endpoint()
    site = (umami_url() or "").strip()

    if explicit:
        base = explicit.rstrip("/")
        if "api.umami.is" in base.lower():
            return base, "client", "cloud_key"
        return base, "client", "bearer"

    if site and "cloud.umami.is" in site.lower():
        region = os.getenv("UMAMI_CLOUD_REGION", "").strip().lower()
        if region in ("us", "eu"):
            return f"https://api.umami.is/v1/{region}", "client", "cloud_key"
        return "https://api.umami.is/v1", "client", "cloud_key"

    if not site:
        raise RuntimeError("UMAMI_URL is not configured")

    return site.rstrip("/"), "legacy", "bearer"


def _headers(auth: AuthKind) -> dict[str, str]:
    if auth == "cloud_key":
        key = umami_api_key()
        if not key:
            raise RuntimeError(
                "Umami Cloud requires an API key: set UMAMI_API_KEY (preferred) or put your "
                "Cloud API key in UMAMI_API_TOKEN. Create a key under Cloud → Settings → API keys."
            )
        return {"x-umami-api-key": key, "Accept": "application/json"}
    token = umami_api_token()
    if not token:
        raise RuntimeError("UMAMI_API_TOKEN is not configured")
    return {"Authorization": f"Bearer {token}", "Accept": "application/json"}


def _website_url(base: str, layout: LayoutKind, website_id: str, resource: str) -> str:
    b = base.rstrip("/")
    if layout == "client":
        return f"{b}/websites/{website_id}/{resource}"
    return f"{b}/api/websites/{website_id}/{resource}"


def _get_json(website_id: str, resource: str, params: dict[str, Any]) -> dict[str, Any]:
    base, layout, auth = _resolve_umami_target()
    url = _website_url(base, layout, website_id, resource)
    headers = _headers(auth)
    with httpx.Client(timeout=60) as client:
        r = client.get(url, headers=headers, params=params)
        r.raise_for_status()
        return r.json()


def fetch_umami_stats(website_id: str, start_at: datetime, end_at: datetime) -> dict[str, Any]:
    params = {
        "startAt": int(start_at.timestamp() * 1000),
        "endAt": int(end_at.timestamp() * 1000),
    }
    return _get_json(website_id, "stats", params)


def fetch_umami_pageviews(website_id: str, start_at: datetime, end_at: datetime) -> dict[str, Any]:
    params = {
        "startAt": int(start_at.timestamp() * 1000),
        "endAt": int(end_at.timestamp() * 1000),
        "unit": "day",
    }
    return _get_json(website_id, "pageviews", params)


def fetch_umami_metrics(website_id: str, start_at: datetime, end_at: datetime) -> dict[str, Any]:
    """Browsers, countries, devices — Umami exposes /metrics with query params."""
    params = {
        "startAt": int(start_at.timestamp() * 1000),
        "endAt": int(end_at.timestamp() * 1000),
    }
    return _get_json(website_id, "metrics", params)


def fetch_umami_events(website_id: str, start_at: datetime, end_at: datetime) -> dict[str, Any]:
    params = {
        "startAt": int(start_at.timestamp() * 1000),
        "endAt": int(end_at.timestamp() * 1000),
    }
    return _get_json(website_id, "events", params)
