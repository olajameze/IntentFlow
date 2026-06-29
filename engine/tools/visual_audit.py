"""Playwright mobile visual audit for JGDevs outreach prospects."""

from __future__ import annotations

import json
import logging
import os
import re
import sys
import time
from pathlib import Path
from typing import Any

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from config import google_api_key, groq_api_key, llm_skip_google
from supabase_client import get_supabase
from tools.llm import generate_outreach_copy

logger = logging.getLogger(__name__)

AUDIT_BUCKET = "outreach-audit"
MOBILE_VIEWPORT = {"width": 390, "height": 844}
_NAV_TIMEOUT_MS = 25_000

_PARKED_PATTERNS = re.compile(
    r"(domain (?:is )?(?:for sale|parking|parked)|buy this domain|godaddy parking|"
    r"squarespace.*coming soon|this domain has been registered|website coming soon)",
    re.I,
)

_EXTRACT_JS = """
() => {
  const viewport = document.querySelector('meta[name="viewport"]');
  const h1 = document.querySelector('h1');
  const telLinks = document.querySelectorAll('a[href^="tel:"]').length;
  const mailtoLinks = document.querySelectorAll('a[href^="mailto:"]').length;
  const forms = document.querySelectorAll('form').length;
  const buttons = [...document.querySelectorAll('button, a.btn, a.button, input[type="submit"]')]
    .map(el => (el.textContent || el.value || '').trim())
    .filter(t => t.length > 0 && t.length < 60)
    .slice(0, 8);
  return {
    title: (document.title || '').trim().slice(0, 200),
    h1: h1 ? h1.textContent.trim().slice(0, 200) : '',
    has_viewport_meta: !!viewport,
    tel_links: telLinks,
    mailto_links: mailtoLinks,
    form_count: forms,
    button_labels: buttons,
  };
}
"""


def visual_audit_enabled(campaign_id: str = "jgdevs") -> bool:
    if (campaign_id or "").strip().lower() != "jgdevs":
        return False
    raw = os.getenv("OUTREACH_VISUAL_AUDIT_ENABLED", "1").strip().lower()
    return raw not in {"0", "false", "no", "off"}


def classify_page_status(title: str, body_text: str, *, navigated: bool) -> str:
    if not navigated:
        return "unreachable"
    blob = f"{title}\n{body_text[:3000]}".lower()
    if _PARKED_PATTERNS.search(blob):
        return "parked"
    if len(body_text.strip()) < 40:
        return "error"
    return "ok"


def template_observations(signals: dict[str, Any], page_status: str) -> list[str]:
    if page_status == "unreachable":
        return [
            "The homepage did not load — visitors may see an error instead of your services.",
            "Broken or unreachable sites lose enquiries to competitors who appear reliable online.",
            "A stable, mobile-friendly site helps customers reach you when they search on their phone.",
        ]
    if page_status == "parked":
        return [
            "The domain appears parked or placeholder — customers may not find a working business site.",
            "A parked page sends people elsewhere when they search for your services.",
            "A clear homepage with contact paths helps you capture enquiries around the clock.",
        ]

    obs: list[str] = []
    if not signals.get("has_viewport_meta"):
        obs.append(
            "No mobile viewport tag detected — the site may not display well on phones, where most local customers browse."
        )
    load_ms = int(signals.get("load_time_ms") or 0)
    if load_ms > 4000:
        obs.append(
            f"The homepage took about {load_ms // 1000} seconds to load on mobile — many visitors leave before it appears."
        )
    form_count = int(signals.get("form_count") or 0)
    tel_links = int(signals.get("tel_links") or 0)
    if form_count == 0 and tel_links == 0:
        obs.append(
            "No booking form or click-to-call link on the homepage — enquiries may wait until you are free to answer the phone."
        )
    h1 = str(signals.get("h1") or "").strip()
    if not h1:
        obs.append(
            "The main headline is missing or unclear — visitors may not understand what you offer in the first few seconds."
        )
    elif len(h1) > 80:
        obs.append(
            "The homepage headline is very long — a shorter, clearer line helps mobile visitors grasp your services quickly."
        )
    if len(obs) < 3:
        obs.append(
            "Make services and contact paths obvious above the fold so visitors know what you do and how to reach you."
        )
    return obs[:3]


def _parse_observations_json(raw: str) -> list[str] | None:
    match = re.search(r"\[[\s\S]*?\]", raw or "")
    if not match:
        return None
    try:
        data = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
    if not isinstance(data, list):
        return None
    lines = [str(x).strip() for x in data if str(x).strip()]
    if len(lines) < 2:
        return None
    return lines[:3]


def _gemini_vision_observations(
    screenshot_bytes: bytes,
    signals: dict[str, Any],
    company: str,
    website: str,
) -> list[str] | None:
    if llm_skip_google():
        return None
    gkey = google_api_key()
    if not gkey or not screenshot_bytes:
        return None
    try:
        import google.generativeai as genai

        os.environ["GOOGLE_API_KEY"] = gkey
        genai.configure(api_key=gkey)
        model_name = os.getenv("GEMINI_VISION_MODEL", "gemini-2.0-flash").strip() or "gemini-2.0-flash"
        model = genai.GenerativeModel(model_name)
        prompt = f"""You reviewed the mobile homepage screenshot for {company} ({website}).

DOM signals (for context): {json.dumps(signals)}

Return JSON only — an array of exactly 3 short observations (plain English, max 220 chars each):
- Each must describe something OBSERVABLE about the mobile homepage (layout, clarity, contact paths, trust).
- Do NOT invent client names, awards, prices, or traffic stats.
- Write for a small business owner, not a web developer — avoid jargon like "DOM" or "LCP".
- Focus on: mobile readability, clear services, booking/contact paths, trust signals.

Example format:
["observation 1", "observation 2", "observation 3"]"""

        resp = model.generate_content(
            [
                prompt,
                {"mime_type": "image/webp", "data": screenshot_bytes},
            ]
        )
        return _parse_observations_json(resp.text or "")
    except Exception as exc:  # noqa: BLE001
        logger.warning("[visual_audit] Gemini vision failed: %s", exc)
        return None


def _groq_dom_observations(
    signals: dict[str, Any],
    page_text: str,
    company: str,
    website: str,
) -> list[str] | None:
    if not groq_api_key():
        return None
    prompt = f"""Return JSON only — an array of exactly 3 short observations about this business homepage (max 220 chars each).

Company: {company}
Website: {website}
Mobile DOM signals: {json.dumps(signals)}

Page text excerpt:
{page_text[:2500]}

Rules:
- Observable facts only — no invented metrics, clients, or awards.
- Plain English for a small business owner.
- Focus on mobile experience, contact/booking paths, clarity of services, trust.

Return ONLY a JSON array of 3 strings."""

    raw = generate_outreach_copy(
        business_context=json.dumps({"name": company, "website": website}),
        lead=f"Visual audit observations: {company}",
        template=prompt,
    )
    return _parse_observations_json(raw or "")


def generate_observations(
    *,
    screenshot_bytes: bytes | None,
    signals: dict[str, Any],
    page_text: str,
    page_status: str,
    company: str,
    website: str,
) -> list[str]:
    if page_status != "ok":
        return template_observations(signals, page_status)

    if screenshot_bytes:
        vision = _gemini_vision_observations(screenshot_bytes, signals, company, website)
        if vision:
            return vision

    dom = _groq_dom_observations(signals, page_text, company, website)
    if dom:
        return dom

    return template_observations(signals, page_status)


def upload_audit_screenshot(prospect_id: str, campaign: str, image_bytes: bytes) -> str | None:
    if not image_bytes:
        return None
    path = f"{campaign}/{prospect_id}/mobile.webp"
    try:
        sb = get_supabase()
        sb.storage.from_(AUDIT_BUCKET).upload(
            path,
            image_bytes,
            file_options={"content-type": "image/webp", "upsert": "true"},
        )
        return path
    except Exception as exc:  # noqa: BLE001
        logger.warning("[visual_audit] screenshot upload failed for %s: %s", prospect_id, exc)
        return None


def _capture_with_playwright(url: str) -> tuple[dict[str, Any], bytes | None, str]:
    from playwright.sync_api import sync_playwright

    signals: dict[str, Any] = {
        "title": "",
        "h1": "",
        "has_viewport_meta": False,
        "tel_links": 0,
        "mailto_links": 0,
        "form_count": 0,
        "button_labels": [],
        "load_time_ms": 0,
    }
    screenshot: bytes | None = None
    page_text = ""
    navigated = False

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport=MOBILE_VIEWPORT,
            user_agent=(
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
                "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
            ),
        )
        page = context.new_page()
        start = time.monotonic()
        try:
            response = page.goto(url, timeout=_NAV_TIMEOUT_MS, wait_until="domcontentloaded")
            navigated = response is not None and (response.ok if response else False)
            page.wait_for_timeout(800)
            extracted = page.evaluate(_EXTRACT_JS)
            if isinstance(extracted, dict):
                signals.update(extracted)
            page_text = (page.inner_text("body") or "")[:8000]
            signals["load_time_ms"] = int((time.monotonic() - start) * 1000)
            screenshot = page.screenshot(type="webp", full_page=False)
        except Exception as exc:  # noqa: BLE001
            logger.warning("[visual_audit] Playwright visit failed for %s: %s", url, exc)
            signals["load_time_ms"] = int((time.monotonic() - start) * 1000)
        finally:
            browser.close()

    page_status = classify_page_status(
        str(signals.get("title") or ""),
        page_text,
        navigated=navigated,
    )
    return (
        {
            "page_status": page_status,
            "signals": signals,
            "page_text": page_text,
            "navigated": navigated,
        },
        screenshot,
        page_status,
    )


def run_visual_audit(
    url: str,
    *,
    prospect_id: str,
    campaign_id: str = "jgdevs",
    company_name: str = "",
) -> dict[str, Any] | None:
    """Visit homepage in mobile Playwright, capture screenshot + observations."""
    if not visual_audit_enabled(campaign_id):
        return None
    if not url.startswith("http"):
        return None

    company = (company_name or "").strip() or "Your business"
    try:
        capture, screenshot_bytes, page_status = _capture_with_playwright(url)
    except Exception as exc:  # noqa: BLE001
        logger.warning("[visual_audit] capture failed for %s: %s", url, exc)
        return None

    signals = capture.get("signals") or {}
    page_text = str(capture.get("page_text") or "")
    observations = generate_observations(
        screenshot_bytes=screenshot_bytes,
        signals=signals,
        page_text=page_text,
        page_status=page_status,
        company=company,
        website=url,
    )

    screenshot_path: str | None = None
    if screenshot_bytes and page_status == "ok":
        screenshot_path = upload_audit_screenshot(prospect_id, campaign_id, screenshot_bytes)

    return {
        "page_status": page_status,
        "observations": observations,
        "signals": signals,
        "screenshot_path": screenshot_path,
        "load_time_ms": int(signals.get("load_time_ms") or 0),
        "page_text_sample": page_text[:2000],
        "page_text_length": len(page_text),
    }


__all__ = [
    "AUDIT_BUCKET",
    "classify_page_status",
    "generate_observations",
    "run_visual_audit",
    "template_observations",
    "upload_audit_screenshot",
    "visual_audit_enabled",
]
