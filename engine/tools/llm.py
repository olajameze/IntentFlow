"""LLM helpers — Gemini (preferred) or Groq fallback."""

from __future__ import annotations

import os
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from config import google_api_key, groq_api_key


def generate_personalised_copy(business_context: str, lead: str, template: str) -> str:
    prompt = f"""You are a 2026 marketing strategist. Business context:\n{business_context}\n\nLead:{lead}\nTemplate:{template}\nReturn concise, compliant copy (no video/TikTok). UK English."""
    gkey = google_api_key()
    if gkey:
        import google.generativeai as genai

        os.environ["GOOGLE_API_KEY"] = gkey
        genai.configure(api_key=gkey)
        model = genai.GenerativeModel("gemini-2.0-flash")
        resp = model.generate_content(prompt)
        return (resp.text or "").strip()

    gq = groq_api_key()
    if gq:
        from groq import Groq

        client = Groq(api_key=gq)
        chat = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
        )
        return (chat.choices[0].message.content or "").strip()

    return "Configure GOOGLE_API_KEY or GROQ_API_KEY for LLM outputs."
