"""Runtime configuration loaded from environment variables."""

from __future__ import annotations

import os
from functools import lru_cache

from dotenv import load_dotenv

# Never drop CI/workflow env vars; .env fills gaps for local runs only.
load_dotenv(override=False)


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
            "SUPABASE_URL is required. GitHub Actions: add repository secret SUPABASE_URL "
            "(same HTTPS project URL as in web NEXT_PUBLIC_SUPABASE_URL). "
            "Engine does not read Vercel env names automatically."
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
    v = os.getenv("UMAMI_URL", "").strip()
    return v or None


@lru_cache
def umami_api_token() -> str | None:
    v = os.getenv("UMAMI_API_TOKEN", "").strip()
    return v or None


@lru_cache
def stripe_encryption_key() -> str | None:
    v = os.getenv("STRIPE_SECRET_ENCRYPTION_KEY", "").strip()
    return v or None
