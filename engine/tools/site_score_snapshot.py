"""Generate JGDevs site score snapshots for outreach prospects."""

from __future__ import annotations

import logging
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from tools.audit_snapshot import (
    _clamp,
    outreach_snapshot_enabled,
    persist_snapshot,
)
from tools.outreach_locale import normalize_outreach_country

logger = logging.getLogger(__name__)

_BOOKING_KEYWORDS = ("book", "booking", "appointment", "schedule", "reserve", "online booking")
_SEO_KEYWORDS = ("seo", "google", "local", "find us", "opening hours", "opening times")
_TRUST_KEYWORDS = ("about", "team", "certified", "qualified", "reviews", "testimonial", "trust")


def _visual_audit(research: dict[str, Any]) -> dict[str, Any]:
    raw = research.get("visual_audit")
    return raw if isinstance(raw, dict) else {}


def compute_site_score_breakdown(research: dict[str, Any]) -> dict[str, int]:
    sample = (research.get("page_text_sample") or "").lower()
    page_len = int(research.get("page_text_length") or 0)
    has_https = bool(research.get("has_https"))
    has_contact = bool(research.get("has_contact_page"))
    visual = _visual_audit(research)
    signals = visual.get("signals") if isinstance(visual.get("signals"), dict) else {}
    page_status = str(visual.get("page_status") or "ok")

    local_seo = 55
    mobile = 50
    booking = 45
    trust = 50

    if any(k in sample for k in _SEO_KEYWORDS):
        local_seo += 15
    if page_len >= 800:
        local_seo += 10
    elif page_len < 400:
        local_seo -= 15

    if has_https:
        mobile += 10
    if page_len >= 1200:
        mobile += 10
    elif page_len < 300:
        mobile -= 20

    if any(k in sample for k in _BOOKING_KEYWORDS):
        booking += 25
    if has_contact:
        booking += 10
    else:
        booking -= 15

    if any(k in sample for k in _TRUST_KEYWORDS):
        trust += 15
    if page_len >= 600:
        trust += 5
    if not has_https:
        trust -= 10

    if signals:
        if not signals.get("has_viewport_meta"):
            mobile -= 15
        load_ms = int(signals.get("load_time_ms") or visual.get("load_time_ms") or 0)
        if load_ms > 4000:
            mobile -= 12
        form_count = int(signals.get("form_count") or 0)
        tel_links = int(signals.get("tel_links") or 0)
        if form_count == 0 and tel_links == 0:
            booking -= 12
        if not str(signals.get("h1") or "").strip():
            trust -= 10

    if page_status in {"unreachable", "parked", "error"}:
        mobile -= 20
        booking -= 15
        trust -= 10

    return {
        "local_seo_visibility": _clamp(local_seo),
        "mobile_experience": _clamp(mobile),
        "booking_enquiry_flow": _clamp(booking),
        "trust_clarity": _clamp(trust),
    }


def compute_overall_site_score(breakdown: dict[str, int]) -> int:
    weighted = (
        breakdown["local_seo_visibility"] * 0.30
        + breakdown["mobile_experience"] * 0.25
        + breakdown["booking_enquiry_flow"] * 0.25
        + breakdown["trust_clarity"] * 0.20
    )
    return _clamp(int(round(weighted)))


def _observation_gaps(research: dict[str, Any]) -> list[dict[str, str]] | None:
    visual = _visual_audit(research)
    observations = visual.get("observations")
    if not isinstance(observations, list) or len(observations) < 2:
        return None
    gaps: list[dict[str, str]] = []
    for i, obs in enumerate(observations[:4]):
        text = str(obs).strip()
        if not text:
            continue
        title = text.split(".")[0].strip()
        if len(title) > 72:
            title = title[:69].rstrip() + "…"
        gaps.append(
            {
                "id": f"visual-{i + 1}",
                "title": title or f"Observation {i + 1}",
                "severity": "high" if i == 0 else "medium",
                "detail": text,
            }
        )
    if len(gaps) >= 2 and len(gaps) < 3:
        gaps.append(
            {
                "id": "visual-3",
                "title": "Mobile clarity",
                "severity": "medium",
                "detail": (
                    "Make services and contact paths obvious above the fold so visitors know what you do and how to reach you."
                ),
            }
        )
    return gaps if len(gaps) >= 3 else None


def _template_gaps(research: dict[str, Any], breakdown: dict[str, int]) -> list[dict[str, str]]:
    visual_gaps = _observation_gaps(research)
    if visual_gaps:
        return visual_gaps

    dims = [
        ("local_seo_visibility", "Local SEO visibility", "Customers may not find you when searching in your area on Google."),
        ("mobile_experience", "Mobile experience", "Most visitors browse on a phone — slow or cramped pages lose enquiries quickly."),
        ("booking_enquiry_flow", "Booking & enquiry flow", "No clear online booking or quote form means enquiries wait until you are free to answer the phone."),
        ("trust_clarity", "Trust & clarity", "Prospects compare options in under a minute — unclear services or missing trust signals send them elsewhere."),
    ]
    ranked = sorted(dims, key=lambda d: breakdown[d[0]])
    gaps: list[dict[str, str]] = []
    for i, (key, title, detail) in enumerate(ranked[:4]):
        score = breakdown[key]
        severity = "high" if score < 45 else "medium" if score < 65 else "low"
        gaps.append({"id": f"site-{i + 1}", "title": title, "severity": severity, "detail": detail})
    if not research.get("has_https"):
        gaps[0]["severity"] = "high"
        gaps[0]["detail"] = (
            "The site is not served over HTTPS — browsers flag it as less secure and Google ranks secure sites higher."
        )
        gaps[0]["title"] = "Secure connection (HTTPS)"
    return gaps[:4] if len(gaps) >= 3 else gaps


def _recommendations(breakdown: dict[str, int]) -> list[str]:
    recs: list[str] = []
    if breakdown["local_seo_visibility"] < 60:
        recs.append("Add clear location pages, opening hours, and service descriptions so Google can match local searches.")
    if breakdown["booking_enquiry_flow"] < 60:
        recs.append("Add a simple booking or quote form so customers can reach you outside office hours.")
    if breakdown["mobile_experience"] < 60:
        recs.append("Optimise page speed and layout for mobile — most local customers decide on their phone.")
    if len(recs) < 2:
        recs.append("Make services and contact paths obvious above the fold so visitors know what you do in seconds.")
    return recs[:3]


def _build_visual_audit_payload(research: dict[str, Any]) -> dict[str, Any] | None:
    visual = _visual_audit(research)
    if not visual:
        return None
    payload: dict[str, Any] = {
        "page_status": str(visual.get("page_status") or "ok"),
        "observations": visual.get("observations") or [],
    }
    if visual.get("screenshot_path"):
        payload["screenshot_path"] = str(visual["screenshot_path"])
    if visual.get("load_time_ms") is not None:
        payload["load_time_ms"] = int(visual["load_time_ms"])
    signals = visual.get("signals")
    if isinstance(signals, dict) and signals:
        payload["signals"] = {
            "has_viewport_meta": bool(signals.get("has_viewport_meta")),
            "form_count": int(signals.get("form_count") or 0),
            "tel_links": int(signals.get("tel_links") or 0),
            "h1": str(signals.get("h1") or "")[:200],
        }
    return payload


def build_site_score_payload(prospect: dict[str, Any], research: dict[str, Any]) -> dict[str, Any]:
    name = (prospect.get("name") or "").strip() or "Your business"
    website = (prospect.get("website_url") or "").strip() or None
    country = normalize_outreach_country(prospect.get("country"))
    city = (prospect.get("city") or "").strip() or None
    sector = str(prospect.get("sector") or research.get("sector") or "generic").strip().lower()

    breakdown = compute_site_score_breakdown(research)
    overall = compute_overall_site_score(breakdown)
    gaps = _template_gaps(research, breakdown)
    now = datetime.now(timezone.utc).isoformat()
    visual_payload = _build_visual_audit_payload(research)

    payload: dict[str, Any] = {
        "snapshot_type": "site_score",
        "version": 1,
        "company_name": name,
        "website": website,
        "country": country,
        "city": city,
        "sector": sector,
        "overall_score": overall,
        "score_breakdown": breakdown,
        "gaps": gaps,
        "recommendations": _recommendations(breakdown),
        "jgdevs_fit": (
            "JGDevs builds fast, mobile-friendly websites for European small businesses with local SEO "
            "and booking or enquiry flows built in — so you capture leads even when you are on a job."
        ),
        "disclaimer": (
            f"Based on publicly available information from {website or 'the business website'}. "
            "This is not a full technical audit."
        ),
        "generated_at": now,
    }
    if visual_payload:
        payload["visual_audit"] = visual_payload
    return payload


def generate_site_score_snapshot(
    prospect: dict[str, Any],
    research: dict[str, Any],
    *,
    campaign_id: str = "jgdevs",
) -> dict[str, Any] | None:
    if campaign_id != "jgdevs" or not outreach_snapshot_enabled():
        return None
    pid = prospect.get("id")
    if not pid:
        return None
    try:
        payload = build_site_score_payload(prospect, research)
        meta = persist_snapshot(str(pid), campaign_id, payload)
        if meta:
            raw = prospect.get("raw") or {}
            if isinstance(raw, dict):
                prospect["raw"] = {**raw, "snapshot": meta}
        return meta
    except Exception as exc:  # noqa: BLE001
        logger.warning("[site_score] generate failed for %s: %s", pid, exc)
        return None
