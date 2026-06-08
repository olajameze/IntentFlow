"""Load outreach campaign config from Supabase (per-business settings)."""

from __future__ import annotations

import json
from dataclasses import replace
from typing import Any

from supabase_client import get_supabase
from tools.outreach_campaigns import (
    CAMPAIGNS,
    CampaignConfig,
    DEFAULT_CAMPAIGN_ID,
    JGDEVS,
    PESTTRACE,
    WEATHERS,
    get_campaign as get_static_campaign,
)


def _row_to_config(row: dict[str, Any], business: dict[str, Any] | None) -> CampaignConfig:
    """Build a CampaignConfig from DB settings + business row."""
    slug = (row.get("campaign_slug") or DEFAULT_CAMPAIGN_ID).strip().lower()
    base = CAMPAIGNS.get(slug) or PESTTRACE

    trust = row.get("trust_badges") or []
    if isinstance(trust, str):
        try:
            trust = json.loads(trust)
        except json.JSONDecodeError:
            trust = []

    follow_ups = row.get("follow_up_prompts") or []
    if isinstance(follow_ups, str):
        try:
            follow_ups = json.loads(follow_ups)
        except json.JSONDecodeError:
            follow_ups = []

    sector_angles = row.get("sector_angles") or {}
    if isinstance(sector_angles, str):
        try:
            sector_angles = json.loads(sector_angles)
        except json.JSONDecodeError:
            sector_angles = {}

    subject_prompt = (row.get("subject_prompt") or "").strip() or base.subject_prompt
    body_prompt = (row.get("body_prompt") or "").strip() or base.body_prompt

    website = (business or {}).get("website_url") or base.website
    name = (business or {}).get("name") or base.label

    return replace(
        base,
        id=slug,
        label=name,
        website=website,
        subject_prompt=subject_prompt,
        body_prompt=body_prompt,
        cta_label=row.get("cta_label") or base.cta_label,
        cta_url_template=row.get("cta_url_template") or base.cta_url_template,
        accent_color=row.get("accent_color") or base.accent_color,
        trust_badges=tuple(trust) if trust else base.trust_badges,
        follow_up_prompts=tuple(follow_ups) if follow_ups else base.follow_up_prompts,
        sector_angles={**base.sector_angles, **sector_angles} if sector_angles else base.sector_angles,
    )


def get_campaign(campaign_id: str | None) -> CampaignConfig:
    """Resolve campaign: DB-enabled settings first, then static registry."""
    key = (campaign_id or DEFAULT_CAMPAIGN_ID).strip().lower()
    try:
        sb = get_supabase()
        result = (
            sb.table("business_outreach_settings")
            .select("*, businesses(*)")
            .eq("campaign_slug", key)
            .eq("enabled", True)
            .limit(1)
            .execute()
        )
        rows = result.data or []
        if rows:
            row = rows[0]
            business = row.get("businesses") if isinstance(row.get("businesses"), dict) else None
            return _row_to_config(row, business)
    except Exception:
        pass

    if key in CAMPAIGNS:
        return CAMPAIGNS[key]
    return get_static_campaign(key)


def get_scrape_queries(campaign_id: str | None) -> dict[str, list[tuple[str, str]]] | None:
    """Load custom scrape queries from business_outreach_settings if present."""
    key = (campaign_id or DEFAULT_CAMPAIGN_ID).strip().lower()
    try:
        sb = get_supabase()
        result = (
            sb.table("business_outreach_settings")
            .select("scrape_queries")
            .eq("campaign_slug", key)
            .eq("enabled", True)
            .limit(1)
            .execute()
        )
        rows = result.data or []
        if not rows:
            return None
        raw = rows[0].get("scrape_queries")
        if not raw:
            return None
        if isinstance(raw, str):
            raw = json.loads(raw)
        if not isinstance(raw, dict):
            return None
        parsed: dict[str, list[tuple[str, str]]] = {}
        for country, items in raw.items():
            if not isinstance(items, list):
                continue
            pairs: list[tuple[str, str]] = []
            for item in items:
                if isinstance(item, (list, tuple)) and len(item) >= 2:
                    pairs.append((str(item[0]), str(item[1])))
                elif isinstance(item, dict):
                    q = item.get("query") or item.get("q")
                    city = item.get("city") or ""
                    if q:
                        pairs.append((str(q), str(city)))
            if pairs:
                parsed[str(country).upper()] = pairs
        return parsed or None
    except Exception:
        return None


def load_enabled_campaigns() -> list[CampaignConfig]:
    """All enabled outreach campaigns for portfolio-wide runs."""
    configs: list[CampaignConfig] = []
    seen: set[str] = set()

    try:
        sb = get_supabase()
        result = (
            sb.table("business_outreach_settings")
            .select("*, businesses(*)")
            .eq("enabled", True)
            .execute()
        )
        for row in result.data or []:
            slug = (row.get("campaign_slug") or "").strip().lower()
            if not slug or slug in seen:
                continue
            seen.add(slug)
            business = row.get("businesses") if isinstance(row.get("businesses"), dict) else None
            configs.append(_row_to_config(row, business))
    except Exception:
        pass

    if not configs:
        return [PESTTRACE, WEATHERS, JGDEVS]

    return configs
