"""Outreach orchestrator — scrape → generate email drafts → summary.

Run via:  python main.py outreach [--campaign pesttrace|weathers]

The pipeline (per campaign):
  1. Scrape businesses from public directories using the campaign's query set.
  2. For every prospect with status = 'scraped' AND campaign = <selected>, generate
     a draft email using the campaign's prompts and sender identity.
  3. Print a summary: scraped / drafted / errors.

Actual sending happens from the dashboard (human reviews each draft first), or in bulk
via the Next.js API once the operator approves them — see
``web/src/app/api/outreach-prospects/send/route.ts``.
"""

from __future__ import annotations

import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from config import active_llm_summary, outreach_scrape_limit
from supabase_client import get_supabase
from tools.outreach_campaign_db import get_campaign, load_enabled_campaigns
from tools.outreach_campaigns import CampaignConfig, DEFAULT_CAMPAIGN_ID
from tools.lead_scoring import compute_lead_score, persist_lead_score
from tools.audit_snapshot import generate_audit_snapshot
from tools.outreach_email import generate_outreach_email
from tools.prospect_research import research_and_persist
from tools.prospect_scraper import scrape_prospects


def run_outreach(campaign: CampaignConfig | str | None = None) -> None:
    """Full outreach pipeline for a single campaign.

    ``campaign`` may be a ``CampaignConfig``, an id (``"pesttrace"`` / ``"weathers"``),
    or ``None`` (falls back to the default campaign).
    """
    cfg = campaign if isinstance(campaign, CampaignConfig) else get_campaign(campaign)

    print("=" * 60)
    print(f"IntentFlow outreach engine — {cfg.label}")
    print(f"  Campaign  : {cfg.id}")
    print(f"  Countries : {', '.join(cfg.countries)}")
    print(f"  Scrape cap: {outreach_scrape_limit()} per run")
    print(f"  LLM chain : {active_llm_summary()}")
    print("=" * 60)

    print("\n[outreach] Step 1 — scraping directories…")
    try:
        new_prospects = scrape_prospects(campaign=cfg)
        print(f"[outreach] {new_prospects} new prospects added to DB.")
    except Exception as exc:  # noqa: BLE001
        print(f"[outreach] Scraping failed: {exc}")
        new_prospects = 0

    print("\n[outreach] Step 2 — research, scoring, and email drafts…")
    sb = get_supabase()
    try:
        result = (
            sb.table("outreach_prospects")
            .select("*")
            .eq("status", "scraped")
            .eq("campaign", cfg.id)
            .order("lead_score", desc=True)
            .order("created_at", desc=False)
            .limit(100)
            .execute()
        )
        pending = result.data or []
    except Exception as exc:  # noqa: BLE001
        print(f"[outreach] Could not load prospects: {exc}")
        pending = []

    drafted = 0
    errors = 0
    for prospect in pending:
        try:
            research = research_and_persist(prospect)
            score, breakdown = compute_lead_score(prospect, research)
            if prospect.get("id"):
                persist_lead_score(str(prospect["id"]), score, breakdown)
                raw = prospect.get("raw") or {}
                if not isinstance(raw, dict):
                    raw = {}
                prospect = {**prospect, "raw": {**raw, "research": research, "score": breakdown}, "lead_score": score}
            if cfg.id == "pesttrace":
                generate_audit_snapshot(prospect, research, campaign_id=cfg.id)
            if generate_outreach_email(prospect, campaign=cfg):
                drafted += 1
            else:
                errors += 1
        except Exception as exc:  # noqa: BLE001
            print(f"[outreach] Draft error for {prospect.get('name')}: {exc}")
            errors += 1

    print("\n" + "=" * 60)
    print("[outreach] Summary:")
    print(f"  Campaign              : {cfg.id}")
    print(f"  New prospects scraped : {new_prospects}")
    print(f"  Email drafts generated: {drafted}")
    print(f"  Errors                : {errors}")
    print("  Action needed         : Review drafts in the Outreach dashboard, then approve to send.")
    print("=" * 60)


def run_all_campaigns() -> None:
    """Run every enabled portfolio outreach campaign (DB + static fallback)."""
    for cfg in load_enabled_campaigns():
        print(f"\n##### Campaign: {cfg.id} ({cfg.label}) #####")
        run_outreach(cfg)


__all__ = ["run_outreach", "run_all_campaigns", "DEFAULT_CAMPAIGN_ID"]
