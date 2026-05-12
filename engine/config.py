"""Runtime configuration loaded from environment variables."""

from __future__ import annotations

import os
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()


@lru_cache
def supabase_url() -> str:
    v = os.getenv("SUPABASE_URL", "").strip()
    if not v:
        raise RuntimeError("SUPABASE_URL is required")
    return v


@lru_cache
def supabase_service_role_key() -> str:
    v = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not v:
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY is required")
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
