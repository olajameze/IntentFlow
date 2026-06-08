"""CLI entry — daily marketing crew and utility modes."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Force UTF-8 output on Windows (avoids charmap errors with non-ASCII business names).
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

_ROOT = Path(__file__).resolve().parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))


def main() -> None:
    parser = argparse.ArgumentParser(description="Omni-Channel Marketing Engine")
    parser.add_argument(
        "mode",
        nargs="?",
        default="full",
        choices=["full", "traffic", "revenue", "outreach"],
        help="full crew run, traffic-only, revenue-only, or outreach pipeline",
    )
    parser.add_argument(
        "--campaign",
        default=None,
        help=(
            "Outreach campaign id (only used with mode=outreach). "
            "Options: 'pesttrace', 'weathers', 'jgdevs', or 'all' to run every campaign. "
            "Defaults to 'pesttrace' for backwards compatibility."
        ),
    )
    args = parser.parse_args()

    from agents.orchestrator import run_all, run_traffic_only
    from tools.stripe_revenue import fetch_stripe_revenue
    from tools.persistence import save_revenue_snapshot

    if args.mode == "outreach":
        from agents.outreach import run_all_campaigns, run_outreach
        campaign = (args.campaign or "").strip().lower()
        if campaign == "all":
            run_all_campaigns()
        else:
            run_outreach(campaign or None)
        return
    if args.mode == "full":
        run_all()
    elif args.mode == "traffic":
        run_traffic_only()
    elif args.mode == "revenue":
        from agents.orchestrator import load_active_businesses
        from crypto_util import decrypt_stripe_secret
        from datetime import datetime, timedelta, timezone

        end = datetime.now(timezone.utc)
        start = end - timedelta(days=30)
        for b in load_active_businesses():
            key = decrypt_stripe_secret(
                b.get("stripe_secret_ciphertext"),
                b.get("stripe_secret_iv"),
                b.get("stripe_secret_tag"),
            )
            if not key:
                continue
            rev = fetch_stripe_revenue(key, (start, end))
            save_revenue_snapshot(b["id"], rev, snapshot_source="stripe_api")
            print(f"Saved revenue snapshot for {b.get('name')}")


if __name__ == "__main__":
    main()
