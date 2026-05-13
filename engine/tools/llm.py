"""LLM helpers — Gemini (preferred) or Groq fallback."""

from __future__ import annotations

import os
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from config import google_api_key, groq_api_key


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
    err = str(exc).lower()
    if any(
        s in err
        for s in (
            "429",
            "quota",
            "rate",
            "resource exhausted",
            "resourceexhausted",
            "too many requests",
        )
    ):
        return True
    return "not found" in err and ("model" in err or "models/" in err)


def generate_personalised_copy(business_context: str, lead: str, template: str) -> str:
    prompt = f"""You are a 2026 marketing strategist. Business context:\n{business_context}\n\nLead:{lead}\nTemplate:{template}\nReturn concise, compliant copy (no video/TikTok). UK English."""
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
            if _google_error_try_groq(exc):
                fb = _groq_generate(prompt)
                if fb:
                    return fb
                return (
                    "[Draft — Gemini quota exhausted] Add GROQ_API_KEY (with GOOGLE_API_KEY) for automatic fallback, "
                    "or set ENGINE_FORCE_GROQ=1 for Crew. "
                    f"({type(exc).__name__})"
                )
            raise

    return _groq_generate(prompt) or "Configure GOOGLE_API_KEY or GROQ_API_KEY for LLM outputs."
