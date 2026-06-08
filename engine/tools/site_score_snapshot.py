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


def compute_site_score_breakdown(research: dict[str, Any]) -> dict[str, int]:
    sample = (research.get("page_text_sample") or "").lower()
    page_len = int(research.get("page_text_length") or 0)
    has_https = bool(research.get("has_https"))
    has_contact = bool(research.get("has_contact_page"))

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


def _template_gaps(research: dict[str, Any], breakdown: dict[str, int]) -> list[dict[str, str]]:
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

    return {
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
