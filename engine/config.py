"""Runtime configuration loaded from environment variables."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

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


def _apply_web_env_local_overrides() -> None:
    """Re-apply selected keys from `web/.env.local` so they override the first-wins `load_dotenv(..., override=False)` order.

    Without this, values set only in `web/.env.local` (e.g. new `GOOGLE_API_KEY`, `ENGINE_USE_GROQ_ONLY`, or `STRIPE_SECRET_ENCRYPTION_KEY`) are
    ignored when the same variable already exists in `engine/.env`. GitHub Actions has no `web/.env.local` — use repo secrets.
    """
    path = _REPO_ROOT / "web" / ".env.local"
    if not path.is_file():
        return
    vals = dotenv_values(path)
    for key in (
        "GOOGLE_API_KEY",
        "GEMINI_TEXT_MODEL",
        "GROQ_API_KEY",
        "ENGINE_USE_GROQ_ONLY",
        "ENGINE_FORCE_GROQ",
        "ENGINE_USE_OLLAMA_FALLBACK",
        "OLLAMA_BASE_URL",
        "OLLAMA_TEXT_MODEL",
        "STRIPE_SECRET_ENCRYPTION_KEY",
        "SMTP_HOST",
        "SMTP_PORT",
        "SMTP_USER",
        "SMTP_PASSWORD",
        "OUTREACH_FROM_NAME",
        "OUTREACH_FROM_EMAIL",
        "OUTREACH_DAILY_SEND_LIMIT",
        "OUTREACH_SCRAPE_LIMIT",
        "OUTREACH_COUNTRIES",
        # Weathers Pest Solutions campaign — its own sender identity + SMTP credentials.
        # Keep these alongside the shared OUTREACH_* keys so a single .env edit cascades
        # to both the Next.js dashboard and the engine.
        "WEATHERS_SMTP_HOST",
        "WEATHERS_SMTP_PORT",
        "WEATHERS_SMTP_USER",
        "WEATHERS_SMTP_PASSWORD",
        "WEATHERS_OUTREACH_FROM_NAME",
        "WEATHERS_OUTREACH_FROM_EMAIL",
        "JGDEVS_OUTREACH_FROM_NAME",
        "JGDEVS_OUTREACH_FROM_EMAIL",
        "JGDEVS_SMTP_HOST",
        "JGDEVS_SMTP_PORT",
        "JGDEVS_SMTP_USER",
        "JGDEVS_SMTP_PASSWORD",
        "BREAZY_OUTREACH_FROM_NAME",
        "BREAZY_OUTREACH_FROM_EMAIL",
        "BREAZY_SMTP_HOST",
        "BREAZY_SMTP_PORT",
        "BREAZY_SMTP_USER",
        "BREAZY_SMTP_PASSWORD",
        "OUTREACH_PUBLIC_BASE_URL",
        "OUTREACH_SNAPSHOT_ENABLED",
        "OUTREACH_VISUAL_AUDIT_ENABLED",
        "UMAMI_URL",
        "UMAMI_API_KEY",
        "UMAMI_API_TOKEN",
        "UMAMI_CLOUD_REGION",
        "UMAMI_API_CLIENT_ENDPOINT",
        "TRAFFIC_SNAPSHOT_DAYS",
    ):
        raw = vals.get(key)
        if raw is None:
            continue
        v = str(raw).strip().strip('"').strip("'")
        if v:
            os.environ[key] = v


_apply_web_env_local_overrides()

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
    """When true, Crew + marketing copy skip Gemini and use Groq only.

    True if ENGINE_USE_GROQ_ONLY / ENGINE_FORCE_GROQ is set, or if there is no GOOGLE_API_KEY
    but GROQ_API_KEY is set (implicit Groq-only after removing Gemini).
    """
    for key in ("ENGINE_USE_GROQ_ONLY", "ENGINE_FORCE_GROQ"):
        if os.getenv(key, "").strip().lower() in {"1", "true", "yes"}:
            return True
    if groq_api_key() and not google_api_key():
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


def ollama_base_url() -> str:
    """Base URL for a running Ollama server (default: localhost)."""
    v = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").strip().strip('"').strip("'")
    return v or "http://127.0.0.1:11434"


def ollama_text_model() -> str:
    """Ollama model tag to use for copy generation (default: llama3.2:1b — fast, ~770 MB)."""
    v = os.getenv("OLLAMA_TEXT_MODEL", "llama3.2:1b").strip().strip('"').strip("'")
    return v or "llama3.2:1b"


def ollama_fallback_enabled() -> bool:
    """True when ENGINE_USE_OLLAMA_FALLBACK=1 is set — enables Ollama as fallback after Groq fails/returns empty."""
    return os.getenv("ENGINE_USE_OLLAMA_FALLBACK", "").strip().lower() in {"1", "true", "yes"}


def active_llm_summary() -> str:
    """Human-readable string describing the active LLM provider chain for log/diagnostic output."""
    parts: list[str] = []
    if llm_skip_google():
        parts.append("groq_only=true")
    elif google_api_key():
        parts.append("google=true")
    if groq_api_key():
        parts.append(f"groq={os.getenv('GROQ_TEXT_MODEL', 'llama-3.1-8b-instant')}")
    else:
        parts.append("groq=missing_key")
    if ollama_fallback_enabled():
        parts.append(f"ollama_fallback={ollama_text_model()}@{ollama_base_url()}")
    else:
        parts.append("ollama_fallback=disabled")
    return " | ".join(parts)


def smtp_host() -> str | None:
    return os.getenv("SMTP_HOST", "").strip() or None


def smtp_port() -> int:
    try:
        return int(os.getenv("SMTP_PORT", "587").strip())
    except ValueError:
        return 587


def smtp_user() -> str | None:
    return os.getenv("SMTP_USER", "").strip() or None


def smtp_password() -> str | None:
    return os.getenv("SMTP_PASSWORD", "").strip() or None


def smtp_configured() -> bool:
    return bool(smtp_host() and smtp_user() and smtp_password())


def outreach_from_name() -> str:
    return os.getenv("OUTREACH_FROM_NAME", "PestTrace Team").strip() or "PestTrace Team"


def outreach_from_email() -> str | None:
    return os.getenv("OUTREACH_FROM_EMAIL", "").strip() or None


def outreach_daily_send_limit() -> int:
    try:
        return max(1, int(os.getenv("OUTREACH_DAILY_SEND_LIMIT", "20").strip()))
    except ValueError:
        return 20


def outreach_scrape_limit() -> int:
    try:
        return max(1, int(os.getenv("OUTREACH_SCRAPE_LIMIT", "30").strip()))
    except ValueError:
        return 30


def outreach_countries() -> list[str]:
    raw = os.getenv("OUTREACH_COUNTRIES", "UK,US,CA,AU").strip()
    return [c.strip().upper() for c in raw.split(",") if c.strip()]


def outreach_public_base_url() -> str:
    return _env_first("OUTREACH_PUBLIC_BASE_URL", "NEXT_PUBLIC_SITE_URL").rstrip("/")


google_api_key.cache_clear()
groq_api_key.cache_clear()
stripe_encryption_key.cache_clear()
