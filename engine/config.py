"""Runtime configuration loaded from environment variables."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

_ENGINE_ROOT = Path(__file__).resolve().parent
_REPO_ROOT = _ENGINE_ROOT.parent

# Fill gaps from typical local layouts (override=False keeps real OS / CI env wins).
for _p in (
    _ENGINE_ROOT / ".env",
    _REPO_ROOT / ".env",
    _REPO_ROOT / "web" / ".env.local",
):
    load_dotenv(_p, override=False)


def _env_first(*names: str) -> str:
    for name in names:
        raw = os.getenv(name, "")
        v = raw.strip().strip('"').strip("'")
        if v:
            return v
    return ""


@lru_cache
def supabase_url() -> str:
    v = _env_first("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL")
    if not v:
        raise RuntimeError(
            "SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL is required. "
            "Add SUPABASE_URL to engine/.env, or reuse web/.env.local (NEXT_PUBLIC_SUPABASE_URL). "
            "GitHub Actions: set repository secret SUPABASE_URL."
        )
    return v


@lru_cache
def supabase_service_role_key() -> str:
    v = _env_first("SUPABASE_SERVICE_ROLE_KEY")
    if not v:
        raise RuntimeError(
            "SUPABASE_SERVICE_ROLE_KEY is required. GitHub Actions: add repository secret "
            "SUPABASE_SERVICE_ROLE_KEY (service_role JWT, server-only)."
        )
    return v


@lru_cache
def google_api_key() -> str | None:
    v = os.getenv("GOOGLE_API_KEY", "").strip()
    return v or None


@lru_cache
def groq_api_key() -> str | None:
    v = os.getenv("GROQ_API_KEY", "").strip()
    return v or None


@lru_cache
def umami_url() -> str | None:
    v = _env_first("UMAMI_URL", "NEXT_PUBLIC_UMAMI_URL")
    return v or None


@lru_cache
def umami_api_token() -> str | None:
    v = os.getenv("UMAMI_API_TOKEN", "").strip()
    return v or None


@lru_cache
def stripe_encryption_key() -> str | None:
    v = os.getenv("STRIPE_SECRET_ENCRYPTION_KEY", "").strip()
    return v or None
