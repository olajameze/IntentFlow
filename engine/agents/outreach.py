"""Outreach orchestrator — scrape → generate email drafts → summary.

Run via:  python main.py outreach

The pipeline:
  1. Scrape pest control businesses from public directories (per configured countries).
  2. For every prospect with status = 'scraped', generate a compliance-focused email draft.
  3. Print a summary: scraped / drafted / errors.

Actual sending is triggered from the dashboard (human reviews each draft first),
or in bulk via the Next.js API when the operator approves them.
"""

from __future__ import annotations

import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from config import active_llm_summary, outreach_countries, outreach_scrape_limit
from supabase_client import get_supabase
from tools.outreach_email import generate_outreach_email
from tools.prospect_scraper import scrape_prospects


def run_outreach() -> None:
    """Full outreach pipeline: scrape new prospects, generate email drafts for all pending ones."""
    countries = outreach_countries()
    print("=" * 60)
    print("IntentFlow outreach engine")
    print(f"  Countries : {', '.join(countries)}")
    print(f"  Scrape cap: {outreach_scrape_limit()} per run")
    print(f"  LLM chain : {active_llm_summary()}")
    print("=" * 60)

    # Step 1: scrape new listings
    print("\n[outreach] Step 1 — scraping directories…")
    try:
        new_prospects = scrape_prospects(countries)
        print(f"[outreach] {new_prospects} new prospects added to DB.")
    except Exception as exc:  # noqa: BLE001
        print(f"[outreach] Scraping failed: {exc}")
        new_prospects = 0

    # Step 2: generate email drafts for all 'scraped' prospects
    print("\n[outreach] Step 2 — generating email drafts for unprocessed prospects…")
    sb = get_supabase()
    try:
        result = (
            sb.table("outreach_prospects")
            .select("*")
            .eq("status", "scraped")
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
            ok = generate_outreach_email(prospect)
            if ok:
                drafted += 1
            else:
                errors += 1
        except Exception as exc:  # noqa: BLE001
            print(f"[outreach] Draft error for {prospect.get('name')}: {exc}")
            errors += 1

    print("\n" + "=" * 60)
    print(f"[outreach] Summary:")
    print(f"  New prospects scraped : {new_prospects}")
    print(f"  Email drafts generated: {drafted}")
    print(f"  Errors                : {errors}")
    print(f"  Action needed         : Review drafts in the Outreach dashboard tab, then approve to send.")
    print("=" * 60)
