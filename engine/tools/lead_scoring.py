"""Lead scoring 0–100 for outreach prioritisation."""

from __future__ import annotations

from typing import Any

_PREFERRED_LOCAL = ("info@", "contact@", "hello@", "enquiries@", "office@")


def _contact_quality_score(email: str) -> int:
    low = (email or "").lower()
    if any(low.startswith(p) for p in _PREFERRED_LOCAL):
        return 15
    if "@" in low:
        return 8
    return 0


def _website_quality_score(research: dict[str, Any]) -> int:
    score = 0
    if research.get("has_https"):
        score += 10
    if research.get("has_contact_page"):
        score += 8
    text_len = int(research.get("page_text_length") or 0)
    if text_len > 1500:
        score += 7
    elif text_len > 400:
        score += 4
    return min(25, score)


def _industry_fit_score(sector: str, campaign_id: str) -> int:
    sector = (sector or "generic").lower()
    if campaign_id == "weathers":
        fit_sectors = {
            "restaurant", "hotel", "care_home", "school", "letting_agent",
            "pub", "gym", "pet_groomer", "bakery", "food_production",
        }
        return 25 if sector in fit_sectors else 12 if sector != "generic" else 8
    if campaign_id == "pesttrace":
        return 25 if sector in ("pest_control_firm", "generic") else 15
    return 12


def _company_size_score(research: dict[str, Any], phone: str) -> int:
    score = 0
    services = research.get("services") or []
    if isinstance(services, list) and len(services) >= 2:
        score += 10
    if (phone or "").strip() or str(research.get("phone") or "").strip():
        score += 5
    text_len = int(research.get("page_text_length") or 0)
    if text_len > 3000:
        score += 5
    return min(20, score)


def _research_boost_score(research: dict[str, Any], page_text: str = "") -> int:
    score = 0
    if str(research.get("contact_name") or "").strip():
        score += 10
    if str(research.get("phone") or "").strip():
        score += 5
    blob = (page_text or "").lower()
    if any(k in blob for k in ("compliance", "audit", "haccp", "food safety", "ipc")):
        score += 10
    return min(25, score)


def _local_market_score(country: str, city: str, campaign_id: str) -> int:
    country = (country or "").upper()
    if campaign_id == "weathers":
        return 15 if country == "UK" and city else 10 if country == "UK" else 0
    target = {"UK", "IE", "DE", "FR", "ES", "IT", "NL", "IN", "US", "CA", "AU"}
    return 15 if country in target else 5


def compute_lead_score(prospect: dict[str, Any], research: dict[str, Any] | None = None) -> tuple[int, dict[str, int]]:
    """Return (score 0–100, breakdown)."""
    raw = prospect.get("raw") or {}
    if not isinstance(raw, dict):
        raw = {}
    research = research or raw.get("research") or {}
    if not isinstance(research, dict):
        research = {}

    campaign = str(prospect.get("campaign") or "pesttrace").lower()
    sector = str(prospect.get("sector") or research.get("sector") or "generic")
    email = str(prospect.get("email") or "")
    country = str(prospect.get("country") or "")
    city = str(prospect.get("city") or "")
    phone = str(prospect.get("phone") or "")

    page_text = str(research.get("page_text_sample") or "")
    breakdown = {
        "website_quality": _website_quality_score(research),
        "industry_fit": _industry_fit_score(sector, campaign),
        "company_size": _company_size_score(research, phone),
        "contact_quality": _contact_quality_score(email),
        "local_market": _local_market_score(country, city, campaign),
        "research_boost": _research_boost_score(research, page_text),
    }
    total = min(100, sum(breakdown.values()))
    return total, breakdown


def persist_lead_score(prospect_id: str, score: int, breakdown: dict[str, int]) -> None:
    from supabase_client import get_supabase

    try:
        sb = get_supabase()
        row = (
            sb.table("outreach_prospects")
            .select("raw")
            .eq("id", prospect_id)
            .single()
            .execute()
        )
        raw = row.data.get("raw") if row.data else {}
        if not isinstance(raw, dict):
            raw = {}
        raw["score"] = breakdown
        sb.table("outreach_prospects").update(
            {"lead_score": score, "raw": raw}
        ).eq("id", prospect_id).execute()
    except Exception:
        pass
