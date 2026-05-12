"""Similarweb free traffic checker — best-effort Playwright scraper."""

from __future__ import annotations

import re
from typing import Any

from playwright.sync_api import sync_playwright


def scrape_similarweb_traffic(domain: str) -> dict[str, Any]:
    """
    Scrapes public Similarweb summary pages. Markup changes break this — use as advisory only.

    Do not violate Similarweb ToS in production; prefer licensed APIs for serious benchmarking.
    """
    clean = domain.lower().strip()
    clean = re.sub(r"^https?://", "", clean).split("/")[0]

    url = f"https://www.similarweb.com/website/{clean}/"

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            )
        )
        page = context.new_page()
        page.goto(url, timeout=120_000, wait_until="domcontentloaded")
        text = page.inner_text("body")
        browser.close()

    # Heuristic extraction — tune selectors for current DOM when needed.
    visits = _find_number(text, r"Total Visits\s*[:\s]*([\d.,]+[KMB]?)")
    rank = _find_number(text, r"Global Rank\s*[:\s]*#?([\d,]+)")
    bounce = _find_number(text, r"Bounce rate\s*[:\s]*([\d.]+%)")

    return {
        "domain": clean,
        "estimated_monthly_visits": visits,
        "global_rank": rank,
        "bounce_rate": bounce,
        "raw_excerpt": text[:4000],
    }


def _find_number(blob: str, pattern: str) -> str | None:
    m = re.search(pattern, blob, flags=re.IGNORECASE | re.MULTILINE)
    return m.group(1).strip() if m else None
