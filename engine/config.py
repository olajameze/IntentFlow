"""Runtime configuration loaded from environment variables."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

import json
import time

from dotenv import dotenv_values, load_dotenv

_ENGINE_ROOT = Path(__file__).resolve().parent
_REPO_ROOT = _ENGINE_ROOT.parent

# Fill gaps from typical local layouts (override=False keeps real OS / CI env wins).
for _p in (
    _ENGINE_ROOT / ".env",
    _REPO_ROOT / ".env",
    _REPO_ROOT / "web" / ".env.local",
):
    load_dotenv(_p, override=False)


def _merge_llm_keys_from_web_env_local() -> None:
    """Let `web/.env.local` win for LLM keys so a new Gemini key in the dashboard env file is not shadowed by `engine/.env`."""
    path = _REPO_ROOT / "web" / ".env.local"
    if not path.is_file():
        return
    vals = dotenv_values(path)
    for key in ("GOOGLE_API_KEY", "GEMINI_TEXT_MODEL", "GROQ_API_KEY"):
        raw = vals.get(key)
        if raw is None:
            continue
        v = str(raw).strip().strip('"').strip("'")
        if v:
            os.environ[key] = v


_before = len(os.getenv("GOOGLE_API_KEY", "").strip())
_merge_llm_keys_from_web_env_local()
_after = len(os.getenv("GOOGLE_API_KEY", "").strip())

# #region agent log
try:
    _dbg = _REPO_ROOT / "debug-7f70f7.log"
    _payload = {
        "sessionId": "7f70f7",
        "hypothesisId": "H5",
        "location": "config.py:after_web_llm_merge",
        "message": "google_key_len_web_merge",
        "data": {
            "google_key_len_before": _before,
            "google_key_len_after": _after,
            "groq_set": bool(os.getenv("GROQ_API_KEY", "").strip()),
        },
        "timestamp": int(time.time() * 1000),
    }
    with _dbg.open("a", encoding="utf-8") as f:
        f.write(json.dumps(_payload, ensure_ascii=False) + "\n")
except OSError:
    pass
# #endregion

# CLI/CI: avoid interactive "view execution traces?" unless user sets CREWAI_TRACING_ENABLED=true
os.environ.setdefault("CREWAI_TRACING_ENABLED", "false")


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


def llm_skip_google() -> bool:
    """When true, Crew + marketing copy use Groq only (use if Gemini free tier quota is 0 / 429)."""
    for key in ("ENGINE_USE_GROQ_ONLY", "ENGINE_FORCE_GROQ"):
        if os.getenv(key, "").strip().lower() in {"1", "true", "yes"}:
            return True
    return False


@lru_cache
def umami_url() -> str | None:
    v = _env_first("UMAMI_URL", "NEXT_PUBLIC_UMAMI_URL")
    return v or None


@lru_cache
def umami_api_client_endpoint() -> str | None:
    """Optional API root, e.g. self-hosted `https://host/api` or Cloud `https://api.umami.is/v1`."""
    v = os.getenv("UMAMI_API_CLIENT_ENDPOINT", "").strip().strip('"').strip("'")
    return v or None


@lru_cache
def umami_api_token() -> str | None:
    v = os.getenv("UMAMI_API_TOKEN", "").strip()
    return v or None


@lru_cache
def umami_api_key() -> str | None:
    """Umami Cloud API key (falls back to UMAMI_API_TOKEN if you store the key there)."""
    v = _env_first("UMAMI_API_KEY", "UMAMI_API_TOKEN")
    return v or None


@lru_cache
def stripe_encryption_key() -> str | None:
    v = os.getenv("STRIPE_SECRET_ENCRYPTION_KEY", "").strip()
    return v or None


google_api_key.cache_clear()
groq_api_key.cache_clear()
