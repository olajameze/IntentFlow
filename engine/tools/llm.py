"""LLM helpers — Gemini (preferred) or Groq fallback."""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
_REPO_ROOT = _ROOT.parent
_DEBUG_LOG = _REPO_ROOT / "debug-7f70f7.log"

if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))


def _dbg_llm(hypothesis_id: str, location: str, message: str, data: dict) -> None:
    # #region agent log
    try:
        payload = {
            "sessionId": "7f70f7",
            "hypothesisId": hypothesis_id,
            "location": location,
            "message": message,
            "data": data,
            "timestamp": int(time.time() * 1000),
        }
        with _DEBUG_LOG.open("a", encoding="utf-8") as f:
            f.write(json.dumps(payload, ensure_ascii=False) + "\n")
    except OSError:
        pass
    # #endregion


from config import google_api_key, groq_api_key, llm_skip_google
from .copy_doctrine import GLOBAL_COPY_DOCTRINE

# Set True after Gemini auth/permission fails once and Groq returns copy — avoids hammering Gemini for every draft in the same process.
_groq_only_after_gemini_auth_failure = False


def _gemini_model_name() -> str:
    return os.getenv("GEMINI_TEXT_MODEL", "gemini-2.0-flash").strip() or "gemini-2.0-flash"


def _groq_generate(prompt: str) -> str:
    gq = groq_api_key()
    if not gq:
        return ""
    from groq import Groq

    client = Groq(api_key=gq)
    chat = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.7,
    )
    return (chat.choices[0].message.content or "").strip()


def _google_error_try_groq(exc: BaseException) -> bool:
    if not groq_api_key():
        return False
    name = type(exc).__name__.lower()
    if "resourceexhausted" in name:
        return True
    # Do not treat InvalidArgument (400) as fallback-worthy — usually malformed request / bad config, not quota/auth.
    if "authentication" in name or "permission" in name:
        return True
    err = str(exc).lower()
    if any(
        s in err
        for s in (
            "429",
            "quota",
            "rate limit",
            "rate_limit",
            "resource exhausted",
            "resourceexhausted",
            "resource_exhausted",
            "too many requests",
            "exceeded your current quota",
            "limit: 0",
            "gemini api error: 429",
            "api key not valid",
            "invalid api key",
            "permission denied",
            "unauthenticated",
            "401",
            "403",
        )
    ):
        return True
    return "not found" in err and ("model" in err or "models/" in err)


def _gemini_auth_like_failure(exc: BaseException) -> bool:
    """401/403/invalid key style failures — prefer Groq for the rest of the run once recovery succeeds."""
    name = type(exc).__name__.lower()
    if any(s in name for s in ("authentication", "permissiondenied", "unauthenticated")):
        return True
    err = str(exc).lower()
    return any(
        s in err
        for s in (
            "401",
            "403",
            "api key not valid",
            "invalid api key",
            "permission denied",
            "unauthenticated",
            "request had invalid authentication credentials",
        )
    )


def gemini_error_should_use_groq(exc: BaseException) -> bool:
    """True when a Groq key is configured and this Gemini failure should trigger Groq (Crew retry, etc.)."""
    return _google_error_try_groq(exc)


def groq_only_after_gemini_auth_failure() -> bool:
    """After one successful Groq recovery from Gemini auth/permission, behave like ENGINE_USE_GROQ_ONLY for this process."""
    return _groq_only_after_gemini_auth_failure


def generate_personalised_copy(
    business_context: str,
    lead: str,
    template: str,
    extra_doctrine: str | None = None,
) -> str:
    doctrine = GLOBAL_COPY_DOCTRINE if not extra_doctrine else f"{GLOBAL_COPY_DOCTRINE}\n\n{extra_doctrine.strip()}"
    prompt = f"""You are a 2026 marketing strategist.

{doctrine}

Business context (JSON — treat as source of truth, do not contradict):
{business_context}

Lead: {lead}

Template / task:
{template}

Return concise, compliant copy only (no meta-commentary). UK English."""
    global _groq_only_after_gemini_auth_failure

    # #region agent log
    _groq_raw = bool(os.getenv("GROQ_API_KEY", "").strip())
    _dbg_llm(
        "H1-H4",
        "llm.py:generate_personalised_copy:entry",
        "copy_generation_entry",
        {
            "llm_skip_google": llm_skip_google(),
            "groq_after_gemini_fail": _groq_only_after_gemini_auth_failure,
            "has_google_api_key": bool(google_api_key()),
            "has_groq_env": _groq_raw,
            "gemini_model": _gemini_model_name(),
        },
    )
    # #endregion

    if llm_skip_google() or _groq_only_after_gemini_auth_failure:
        return _groq_generate(prompt) or "Configure GROQ_API_KEY (ENGINE_USE_GROQ_ONLY=1 skips Gemini for all copy)."
    gkey = google_api_key()
    if gkey:
        import google.generativeai as genai

        os.environ["GOOGLE_API_KEY"] = gkey
        genai.configure(api_key=gkey)
        model = genai.GenerativeModel(_gemini_model_name())
        try:
            resp = model.generate_content(prompt)
            return (resp.text or "").strip()
        except Exception as exc:  # noqa: BLE001
            # #region agent log
            _try_groq = _google_error_try_groq(exc)
            _auth_like = _gemini_auth_like_failure(exc) or "authentication" in type(exc).__name__.lower()
            _dbg_llm(
                "H1-H3",
                "llm.py:generate_personalised_copy:gemini_except",
                "gemini_exception",
                {
                    "exc_type": type(exc).__name__,
                    "try_groq_branch": _try_groq,
                    "auth_like": _auth_like,
                    "has_groq_env": _groq_raw,
                },
            )
            # #endregion
            # Auth/quota class errors do not reach Groq fallback when GROQ_API_KEY is unset (_google_error_try_groq is False).
            # Return actionable copy instead of raising so pending_posts are not replaced by generic placeholders.
            if _auth_like and not _groq_raw:
                return (
                    "[Draft — configure LLM fallback] Gemini authentication failed (check GOOGLE_API_KEY in Google AI / Cloud). "
                    "Add GROQ_API_KEY to engine/.env (or remove an empty GROQ_API_KEY line there so web/.env.local can supply it). "
                    "Alternatively set ENGINE_USE_GROQ_ONLY=1 with a valid GROQ_API_KEY to skip Gemini. "
                    f"({type(exc).__name__})"
                )
            if _google_error_try_groq(exc):
                fb = _groq_generate(prompt)
                if fb:
                    if _gemini_auth_like_failure(exc):
                        _groq_only_after_gemini_auth_failure = True
                        print(
                            "IntentFlow: Gemini failed (auth/permission). "
                            "Using Groq for the rest of this engine run. "
                            "Set ENGINE_USE_GROQ_ONLY=1 in .env to skip Gemini from startup."
                        )
                    return fb
                hint = (
                    "Gemini auth or quota failed and Groq returned nothing. "
                    "Set a valid GROQ_API_KEY, or ENGINE_USE_GROQ_ONLY=1 / ENGINE_FORCE_GROQ=1 to skip Gemini."
                )
                return f"[Draft — LLM fallback failed] {hint} ({type(exc).__name__})"
            raise

    return _groq_generate(prompt) or "Configure GOOGLE_API_KEY or GROQ_API_KEY for LLM outputs."
