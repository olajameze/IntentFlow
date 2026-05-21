"""One-off repair: regenerate subject lines for existing draft_ready prospects.

Background — early outreach runs produced garbage subjects because the small
fallback LLM emitted preamble ("Target Audience: ...", "Strategy: ...", JSON
echoes of the input context) that slipped past the original parser. Both the
prompt template and the body of those drafts are still good; only the two
subject columns (``email_subject`` + ``email_subject_b``) need re-doing.

This script:
  1. Finds every draft_ready prospect whose A or B subject looks broken
  2. Re-runs only the subject prompt via the same LLM chain (Groq → Ollama)
  3. Pipes the response through the new ``_parse_subject_variants`` (which
     rejects JSON echoes, meta-commentary, label-only lines, and over-long
     verbose output)
  4. Writes the cleaned ``email_subject`` + ``email_subject_b`` back
  5. Skips anything that already looks clean

Run with:
    python scripts/repair_subjects.py                # all campaigns
    python scripts/repair_subjects.py --campaign weathers
    python scripts/repair_subjects.py --dry-run      # print what would change
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path

# Force UTF-8 on Windows so non-ASCII business names don't crash print().
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# Make engine/* importable when run as `python scripts/repair_subjects.py`
_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from supabase_client import get_supabase
from tools.llm import generate_personalised_copy
from tools.outreach_campaigns import DEFAULT_CAMPAIGN_ID, get_campaign, sector_angle
from tools.outreach_email import _looks_like_subject, _parse_subject_variants


def _looks_broken(subject: str | None) -> bool:
    """A subject is 'broken' when it would fail the parser's subject-line sniffer.

    By sharing ``_looks_like_subject`` with the runtime parser we guarantee the repair
    script catches every junk subject the latest parser would reject — no drift.
    """
    if not subject or not subject.strip():
        return True
    return not _looks_like_subject(subject.strip())


def repair(campaign_id: str | None, dry_run: bool) -> None:
    sb = get_supabase()

    query = (
        sb.table("outreach_prospects")
        .select("id, name, email, website_url, country, sector, campaign, email_subject, email_subject_b")
        .eq("status", "draft_ready")
    )
    if campaign_id:
        query = query.eq("campaign", campaign_id)
    rows = query.limit(500).execute().data or []

    print(f"Found {len(rows)} draft_ready prospects to inspect"
          + (f" (campaign={campaign_id})" if campaign_id else " (all campaigns)"))

    fixed = 0
    skipped = 0
    failed = 0

    for p in rows:
        a_broken = _looks_broken(p.get("email_subject"))
        b_broken = _looks_broken(p.get("email_subject_b"))
        if not (a_broken or b_broken):
            skipped += 1
            continue

        cid = (p.get("campaign") or DEFAULT_CAMPAIGN_ID).strip().lower()
        try:
            cfg = get_campaign(cid)
        except Exception as exc:  # noqa: BLE001
            print(f"  ! unknown campaign '{cid}' for {p.get('name')}: {exc}")
            failed += 1
            continue

        name = (p.get("name") or "").strip()
        website = (p.get("website_url") or cfg.website).strip()
        country = (p.get("country") or "UK").upper()
        sector = str(p.get("sector") or "generic").strip().lower() or "generic"
        angle = sector_angle(cfg, sector)

        subject_prompt = cfg.subject_prompt.format(
            name=name, website=website, country=country, sector_angle=angle
        )
        try:
            raw = generate_personalised_copy(
                business_context=f'{{"name": "{name}", "website": "{website}", "country": "{country}", "sector": "{sector}"}}',
                lead=f"Prospect: {name}",
                template=subject_prompt,
            )
        except Exception as exc:  # noqa: BLE001
            print(f"  ! LLM failed for {name}: {exc}")
            failed += 1
            continue

        new_a, new_b = _parse_subject_variants(raw, cfg.fallback_subject)
        old_a = (p.get("email_subject") or "").strip()
        old_b = (p.get("email_subject_b") or "").strip()

        print(f"\n* {name} ({cid}/{sector})")
        if a_broken:
            print(f"    A old: {old_a[:70]!r}")
            print(f"    A new: {new_a!r}")
        if b_broken:
            print(f"    B old: {old_b[:70]!r}")
            print(f"    B new: {new_b!r}")

        if dry_run:
            fixed += 1
            continue

        try:
            sb.table("outreach_prospects").update(
                {
                    "email_subject": new_a if a_broken else old_a,
                    "email_subject_b": new_b if b_broken else old_b,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
            ).eq("id", p["id"]).execute()
            fixed += 1
        except Exception as exc:  # noqa: BLE001
            print(f"  ! DB update failed for {name}: {exc}")
            failed += 1

    print("\n" + "=" * 60)
    print(f"Repaired : {fixed}{' (dry-run)' if dry_run else ''}")
    print(f"Skipped  : {skipped} (already clean)")
    print(f"Failed   : {failed}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Regenerate broken subject lines on draft_ready prospects")
    parser.add_argument("--campaign", default=None, help="restrict to one campaign id (pesttrace, weathers)")
    parser.add_argument("--dry-run", action="store_true", help="print what would change, don't write")
    args = parser.parse_args()
    repair(args.campaign, args.dry_run)
