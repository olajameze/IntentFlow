"""Generate Weathers premises pest risk briefs for outreach prospects."""

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

_SECTOR_SEASONAL: dict[str, list[str]] = {
    "restaurant": ["Cockroach activity near food prep", "Fly pressure around waste areas"],
    "hotel": ["Bed bug transfer risk in high turnover rooms", "Discreet treatment timing for guest comfort"],
    "care_home": ["Rodent pressure as weather cools", "Documented pest visits for inspection records"],
    "school": ["Wasp nests near playgrounds", "Ant activity in dining areas"],
    "letting_agent": ["Rodent entry points in older stock", "Tenant call-outs across multiple properties"],
    "pub": ["Fruit flies and wasps around outdoor service", "Rodent activity behind kitchen areas"],
    "gym": ["Changing-room flea or cockroach risk", "Fly control in high-traffic areas"],
    "pet_groomer": ["Flea carry-over from visiting pets", "Quick turnaround needed between appointments"],
    "bakery": ["Rodent and stored-product insect risk", "Audit-ready documentation for food safety visits"],
    "food_production": ["Rodent monitoring at storage points", "Audit documentation for customer visits"],
    "generic": ["Rodent pressure as premises cool", "Flying insect activity in warmer spells"],
}


def _season_context() -> tuple[str, list[str]]:
    month = datetime.now(timezone.utc).month
    if month in (6, 7, 8):
        return (
            "Summer",
            [
                "Wasp and fly activity increases around food and waste areas",
                "Ant trails into kitchens and storage spaces",
                "Open doors and windows raise flying-insect entry risk",
            ],
        )
    if month in (9, 10):
        return (
            "Autumn",
            [
                "Rodents begin moving indoors for warmth and shelter",
                "Cluster flies and ladybirds seek harbourage inside premises",
                "Spiders become more visible indoors",
            ],
        )
    if month in (11, 12, 1, 2):
        return (
            "Winter",
            [
                "Rodent infestations peak in lofts, basements, and bin stores",
                "Heated indoor areas attract cockroach activity",
                "Proofing gaps before cold snaps reduces entry points",
            ],
        )
    return (
        "Spring",
        [
            "Ant colonies expand and forage indoors",
            "Wasp and bee queens scout eaves and loft spaces",
            "Flea activity rises as pets spend more time outdoors",
        ],
    )


def compute_risk_breakdown(research: dict[str, Any], sector: str) -> dict[str, int]:
    sample = (research.get("page_text_sample") or "").lower()
    sector = (sector or "generic").lower()

    rodent = 45
    insect = 45
    audit = 40
    premises = 50

    if sector in {"restaurant", "pub", "bakery", "food_production"}:
        rodent += 15
        insect += 15
        audit += 20
    if sector in {"hotel", "care_home"}:
        rodent += 10
        audit += 15
    if sector in {"letting_agent"}:
        rodent += 20
        premises += 10
    if any(k in sample for k in ("food", "kitchen", "hygiene", "menu")):
        insect += 10
    if int(research.get("page_text_length") or 0) < 400:
        premises += 10

    return {
        "rodent_risk": _clamp(rodent),
        "insect_risk": _clamp(insect),
        "audit_pressure": _clamp(audit),
        "premises_factors": _clamp(premises),
    }


def compute_overall_risk(breakdown: dict[str, int]) -> int:
    weighted = (
        breakdown["rodent_risk"] * 0.30
        + breakdown["insect_risk"] * 0.30
        + breakdown["audit_pressure"] * 0.20
        + breakdown["premises_factors"] * 0.20
    )
    return _clamp(int(round(weighted)))


def _template_gaps(sector: str, season: str) -> list[dict[str, str]]:
    titles = list(_SECTOR_SEASONAL.get(sector, _SECTOR_SEASONAL["generic"]))
    while len(titles) < 3:
        titles.extend(_SECTOR_SEASONAL["generic"])
    gaps = []
    for i, title in enumerate(titles[:3]):
        gaps.append(
            {
                "id": f"risk-{i + 1}",
                "title": title,
                "severity": "high" if i == 0 else "medium",
                "detail": (
                    f"During {season.lower()}, this is a common pressure point for "
                    f"{sector.replace('_', ' ')} premises in the West Midlands — "
                    "especially where proofing or monitoring is not already visible."
                ),
                "framework": "Food hygiene / CQC context" if sector in {"restaurant", "care_home", "food_production"} else "",
            }
        )
    return gaps


def _prevention_steps(sector: str) -> list[str]:
    steps = [
        "Schedule a professional inspection before peak seasonal activity.",
        "Document proofing and monitoring so audit or tenant questions are easy to answer.",
    ]
    if sector in {"restaurant", "pub", "bakery"}:
        steps.append("Keep waste areas sealed and kitchen gaps proofed — flies and rodents exploit both quickly.")
    elif sector == "hotel":
        steps.append("Train front-of-house staff to spot early bed bug signs in high-turnover rooms.")
    else:
        steps.append("Review external bait monitoring if you manage multiple sites or older buildings.")
    return steps[:3]


def build_risk_brief_payload(prospect: dict[str, Any], research: dict[str, Any]) -> dict[str, Any]:
    name = (prospect.get("name") or "").strip() or "Your premises"
    website = (prospect.get("website_url") or "").strip() or None
    country = normalize_outreach_country(prospect.get("country"))
    city = (prospect.get("city") or "").strip() or None
    sector = str(prospect.get("sector") or research.get("sector") or "generic").strip().lower()

    season_label, seasonal_risks = _season_context()
    breakdown = compute_risk_breakdown(research, sector)
    overall = compute_overall_risk(breakdown)
    gaps = _template_gaps(sector, season_label)

    now = datetime.now(timezone.utc).isoformat()
    return {
        "snapshot_type": "risk_brief",
        "version": 1,
        "company_name": name,
        "website": website,
        "country": country,
        "city": city,
        "sector": sector,
        "season_label": season_label,
        "seasonal_risks": seasonal_risks,
        "overall_score": overall,
        "score_breakdown": breakdown,
        "gaps": gaps,
        "prevention_steps": _prevention_steps(sector),
        "weathers_fit": (
            "Weathers Pest Solutions is a BPCA-certified West Midlands team offering discreet treatments, "
            "24/7 emergency response, and documented visits that help premises stay inspection-ready."
        ),
        "disclaimer": (
            f"Based on publicly available information from {website or 'the business website'} and typical "
            f"{season_label.lower()} patterns for this sector. This is not a formal pest survey."
        ),
        "generated_at": now,
    }


def generate_risk_brief_snapshot(
    prospect: dict[str, Any],
    research: dict[str, Any],
    *,
    campaign_id: str = "weathers",
) -> dict[str, Any] | None:
    if campaign_id != "weathers" or not outreach_snapshot_enabled():
        return None
    pid = prospect.get("id")
    if not pid:
        return None
    try:
        payload = build_risk_brief_payload(prospect, research)
        meta = persist_snapshot(str(pid), campaign_id, payload)
        if meta:
            raw = prospect.get("raw") or {}
            if isinstance(raw, dict):
                prospect["raw"] = {**raw, "snapshot": meta}
        return meta
    except Exception as exc:  # noqa: BLE001
        logger.warning("[risk_brief] generate failed for %s: %s", pid, exc)
        return None
