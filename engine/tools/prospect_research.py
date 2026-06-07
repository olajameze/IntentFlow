"""Analyse prospect websites before outreach — services, location, industry, gaps."""

from __future__ import annotations

import json
import logging
import re
import sys
from html import unescape
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from supabase_client import get_supabase
from tools.llm import generate_outreach_copy
from tools.outreach_sector import classify_sector
from tools.prospect_scraper import _fetch  # noqa: PLC2701

logger = logging.getLogger(__name__)

_PAGE_SLUGS = ("", "/about", "/about-us", "/services", "/our-services", "/contact", "/contact-us")

_TITLE_RE = re.compile(r"<title[^>]*>([^<]+)</title>", re.I)
_META_DESC_RE = re.compile(
    r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']+)["\']',
    re.I,
)
_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")


def _strip_html(html: str) -> str:
    text = _TAG_RE.sub(" ", html)
    text = unescape(text)
    return _WS_RE.sub(" ", text).strip()


def _fetch_pages(base_url: str) -> str:
    chunks: list[str] = []
    total = 0
    for slug in _PAGE_SLUGS:
        url = urljoin(base_url.rstrip("/") + "/", slug.lstrip("/")) if slug else base_url
        html = _fetch(url, timeout=10)
        if not html:
            continue
        text = _strip_html(html)
        if len(text) < 40:
            continue
        chunks.append(text[:2500])
        total += len(text)
        if total >= 8000:
            break
    return "\n\n".join(chunks)[:8000]


def _heuristic_research(
    name: str,
    website: str,
    country: str,
    city: str,
    sector: str,
    page_text: str,
) -> dict[str, Any]:
    title_m = _TITLE_RE.search(page_text) if "<title" in page_text else None
    location = f"{city}, {country}".strip(", ") if city else country
    industry = sector.replace("_", " ")
    services: list[str] = []
    for kw in ("pest control", "rodent", "bed bug", "wasp", "flea", "compliance", "audit"):
        if kw in page_text.lower():
            services.append(kw.title())
    if not services:
        services = [industry or "commercial services"]
    return {
        "services": services[:5],
        "location": location or country,
        "industry": industry,
        "weaknesses": ["limited digital presence"] if len(page_text) < 500 else [],
        "opportunities": [f"operational improvement for {name}"],
    }


def _llm_extract_research(name: str, website: str, country: str, page_text: str) -> dict[str, Any] | None:
    if not page_text or len(page_text) < 80:
        return None
    prompt = f"""Analyse this company website text and return JSON only:
{{
  "services": ["service 1", "service 2"],
  "location": "City, Country",
  "industry": "industry label",
  "weaknesses": ["one credible gap"],
  "opportunities": ["one relevant business opportunity"]
}}

Company: {name}
Website: {website}
Country: {country}

Website text:
{page_text[:6000]}"""

    raw = generate_outreach_copy(
        business_context=json.dumps({"name": name, "website": website, "country": country}),
        lead=f"Prospect research: {name}",
        template=prompt,
    )
    match = re.search(r"\{[\s\S]*\}", raw or "")
    if not match:
        return None
    try:
        data = json.loads(match.group(0))
        if isinstance(data, dict) and data.get("services"):
            return data
    except json.JSONDecodeError:
        return None
    return None


def research_prospect(prospect: dict[str, Any]) -> dict[str, Any]:
    """Fetch and analyse prospect website; return research dict."""
    name = (prospect.get("name") or "").strip()
    website = (prospect.get("website_url") or "").strip()
    country = (prospect.get("country") or "").strip()
    city = (prospect.get("city") or "").strip()
    sector = str(prospect.get("sector") or "generic").strip().lower()
    query = ""
    raw_existing = prospect.get("raw") or {}
    if isinstance(raw_existing, dict):
        query = str(raw_existing.get("query") or "")

    if not website.startswith("http"):
        return _heuristic_research(name, website, country, city, sector, "")

    page_html_parts: list[str] = []
    for slug in _PAGE_SLUGS:
        url = urljoin(website.rstrip("/") + "/", slug.lstrip("/")) if slug else website
        html = _fetch(url)
        if html:
            page_html_parts.append(html)
    combined_html = "\n".join(page_html_parts)
    page_text = _strip_html(combined_html)

    if not sector or sector == "generic":
        sector = classify_sector(name, query, website)

    research = _llm_extract_research(name, website, country, page_text)
    if not research:
        research = _heuristic_research(name, website, country, city, sector, page_text)

    research["sector"] = sector
    research["page_text_length"] = len(page_text)
    research["has_https"] = website.lower().startswith("https://")
    research["has_contact_page"] = any(
        s in combined_html.lower() for s in ("/contact", "contact us", "mailto:")
    )
    return research


def persist_research(prospect_id: str, research: dict[str, Any]) -> bool:
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
        raw["research"] = research
        sb.table("outreach_prospects").update({"raw": raw}).eq("id", prospect_id).execute()
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("[prospect_research] persist failed for %s: %s", prospect_id, exc)
        return False


def research_and_persist(prospect: dict[str, Any]) -> dict[str, Any]:
    """Run research and save to outreach_prospects.raw.research."""
    pid = prospect.get("id")
    research = research_prospect(prospect)
    if pid:
        persist_research(str(pid), research)
    return research
