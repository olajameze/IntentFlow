"""Scrape pest control business listings from public directories.

Targets by country:
  UK  — Yell.com
  US  — Yelp.com
  CA  — YellowPages.ca
  AU  — Yelp.com.au

Pipeline per business found:
  1. Extract name, website, phone, address from listing page.
  2. Visit business website and hunt for contact email (mailto: links, contact pages).
  3. Validate: skip if no email found, no website, or site appears inactive.
  4. Insert into outreach_prospects (ON CONFLICT DO NOTHING on email uniqueness).

Returns the number of new prospects written to the DB.
"""

from __future__ import annotations

import re
import sys
import time
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from config import outreach_scrape_limit
from supabase_client import get_supabase


# ── Email extraction helpers ────────────────────────────────────────────────

_EMAIL_RE = re.compile(
    r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}",
    re.IGNORECASE,
)

_JUNK_EMAIL_PATTERNS = re.compile(
    r"(example|test|noreply|no-reply|donotreply|sentry|support@sentry|@2x|\.png|\.jpg|\.css|wix|wordpress|squarespace)",
    re.IGNORECASE,
)


def _extract_emails_from_text(text: str) -> list[str]:
    found = _EMAIL_RE.findall(text)
    clean = []
    for e in found:
        if _JUNK_EMAIL_PATTERNS.search(e):
            continue
        if len(e) > 80:
            continue
        clean.append(e.lower())
    return list(dict.fromkeys(clean))  # deduplicate preserving order


def _best_email(emails: list[str]) -> str | None:
    """Pick the most likely contact email — prefer info@/contact@/hello@ over others."""
    if not emails:
        return None
    priority = ["info@", "contact@", "hello@", "enquiries@", "admin@", "office@"]
    for prefix in priority:
        for e in emails:
            if e.startswith(prefix):
                return e
    return emails[0]


# ── Playwright helpers ──────────────────────────────────────────────────────

def _new_browser_context(playwright: Any):  # type: ignore[type-arg]
    """Launch a headed-less Chromium with realistic headers."""
    browser = playwright.chromium.launch(headless=True, args=["--no-sandbox"])
    ctx = browser.new_context(
        user_agent=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        viewport={"width": 1280, "height": 800},
        locale="en-GB",
    )
    return browser, ctx


def _safe_goto(page: Any, url: str, timeout: int = 15_000) -> bool:
    try:
        page.goto(url, timeout=timeout, wait_until="domcontentloaded")
        return True
    except Exception:  # noqa: BLE001
        return False


def _find_email_on_website(page: Any, base_url: str) -> str | None:
    """Visit a business website and return the best contact email found."""
    # Step 1: scan homepage for mailto links and raw emails
    text = page.content()
    emails = _extract_emails_from_text(text)

    # Also extract from mailto: hrefs specifically
    hrefs = page.eval_on_selector_all("a[href^='mailto:']", "els => els.map(e => e.href)")
    for href in hrefs:
        m = _EMAIL_RE.search(href.replace("mailto:", ""))
        if m:
            emails.append(m.group(0).lower())

    best = _best_email(list(dict.fromkeys(emails)))
    if best:
        return best

    # Step 2: try /contact page
    for slug in ["/contact", "/contact-us", "/get-in-touch", "/about"]:
        contact_url = urljoin(base_url, slug)
        if _safe_goto(page, contact_url, timeout=10_000):
            time.sleep(0.5)
            text2 = page.content()
            emails2 = _extract_emails_from_text(text2)
            hrefs2 = page.eval_on_selector_all("a[href^='mailto:']", "els => els.map(e => e.href)")
            for href in hrefs2:
                m = _EMAIL_RE.search(href.replace("mailto:", ""))
                if m:
                    emails2.append(m.group(0).lower())
            best2 = _best_email(list(dict.fromkeys(emails2)))
            if best2:
                return best2

    return None


# ── Country-specific directory scrapers ────────────────────────────────────

def _scrape_yell_uk(page: Any, limit: int) -> list[dict]:
    """Scrape Yell.com for UK pest control businesses."""
    results: list[dict] = []
    locations = ["London", "Manchester", "Birmingham", "Leeds", "Bristol", "Sheffield", "Edinburgh", "Glasgow"]

    for location in locations:
        if len(results) >= limit:
            break
        url = f"https://www.yell.com/s/pest-control-{location.lower().replace(' ', '-')}.html"
        if not _safe_goto(page, url):
            continue
        time.sleep(1.5)

        try:
            cards = page.query_selector_all("article.businessCapsule")
            for card in cards:
                if len(results) >= limit:
                    break
                try:
                    name_el = card.query_selector("h2.businessCapsule--name a")
                    name = name_el.inner_text().strip() if name_el else ""
                    if not name:
                        continue
                    website_el = card.query_selector("a[data-tracking='website']")
                    website = website_el.get_attribute("href") if website_el else ""
                    phone_el = card.query_selector("span.businessCapsule--telephoneNumber")
                    phone = phone_el.inner_text().strip() if phone_el else ""
                    address_el = card.query_selector("span.businessCapsule--address")
                    address = address_el.inner_text().strip() if address_el else location

                    if website:
                        results.append({
                            "name": name, "website_url": website, "phone": phone,
                            "city": location, "country": "UK", "source": "yell",
                            "raw": {"address": address, "yell_url": url},
                        })
                except Exception:  # noqa: BLE001
                    continue
        except Exception:  # noqa: BLE001
            continue

    return results


def _scrape_yelp(page: Any, country: str, limit: int) -> list[dict]:
    """Scrape Yelp for US, CA, or AU pest control businesses."""
    results: list[dict] = []
    domain_map = {"US": "yelp.com", "CA": "yelp.ca", "AU": "yelp.com.au"}
    city_map = {
        "US": ["New York", "Los Angeles", "Chicago", "Houston", "Phoenix"],
        "CA": ["Toronto", "Vancouver", "Calgary", "Montreal", "Ottawa"],
        "AU": ["Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide"],
    }
    domain = domain_map.get(country, "yelp.com")
    cities = city_map.get(country, [])

    for city in cities:
        if len(results) >= limit:
            break
        city_slug = city.lower().replace(" ", "-")
        url = f"https://www.{domain}/search?find_desc=pest+control&find_loc={city_slug}"
        if not _safe_goto(page, url):
            continue
        time.sleep(2)

        try:
            # Yelp renders client-side; extract from JSON-LD or visible text
            content = page.content()
            # Extract business names and URLs from Yelp result links
            links = page.query_selector_all("a[href*='/biz/']")
            seen: set[str] = set()
            for link in links:
                if len(results) >= limit:
                    break
                try:
                    href = link.get_attribute("href") or ""
                    if not href or href in seen:
                        continue
                    seen.add(href)
                    name = link.inner_text().strip()
                    if not name or len(name) < 3:
                        continue
                    full_href = href if href.startswith("http") else f"https://www.{domain}{href}"
                    results.append({
                        "name": name, "website_url": "", "phone": "",
                        "city": city, "country": country, "source": "yelp",
                        "raw": {"yelp_url": full_href, "search_url": url},
                    })
                except Exception:  # noqa: BLE001
                    continue
        except Exception:  # noqa: BLE001
            continue

    return results


def _scrape_yellowpages_ca(page: Any, limit: int) -> list[dict]:
    """Scrape YellowPages.ca for Canadian pest control businesses."""
    results: list[dict] = []
    cities = ["Toronto", "Vancouver", "Calgary", "Edmonton", "Ottawa"]

    for city in cities:
        if len(results) >= limit:
            break
        url = f"https://www.yellowpages.ca/search/si/1/pest+control/{city}"
        if not _safe_goto(page, url):
            continue
        time.sleep(1.5)

        try:
            cards = page.query_selector_all("div.listing__content")
            for card in cards:
                if len(results) >= limit:
                    break
                try:
                    name_el = card.query_selector("a.listing__name")
                    name = name_el.inner_text().strip() if name_el else ""
                    if not name:
                        continue
                    website_el = card.query_selector("a.listing__website")
                    website = website_el.get_attribute("href") if website_el else ""
                    phone_el = card.query_selector("span.listing__phone")
                    phone = phone_el.inner_text().strip() if phone_el else ""
                    results.append({
                        "name": name, "website_url": website, "phone": phone,
                        "city": city, "country": "CA", "source": "yellowpages_ca",
                        "raw": {"search_url": url},
                    })
                except Exception:  # noqa: BLE001
                    continue
        except Exception:  # noqa: BLE001
            continue

    return results


# ── Main scrape entry point ─────────────────────────────────────────────────

def scrape_prospects(countries: list[str] | None = None) -> int:
    """Scrape pest control businesses for the given countries and write new prospects to DB.

    Returns the number of newly inserted prospects.
    """
    from playwright.sync_api import sync_playwright

    target_countries = [c.upper() for c in (countries or ["UK", "US", "CA", "AU"])]
    per_country = max(5, outreach_scrape_limit() // max(1, len(target_countries)))

    sb = get_supabase()
    inserted = 0

    with sync_playwright() as pw:
        browser, ctx = _new_browser_context(pw)
        listing_page = ctx.new_page()
        detail_page = ctx.new_page()

        try:
            raw_prospects: list[dict] = []

            for country in target_countries:
                print(f"[scraper] Scraping {country} (limit {per_country})…")
                try:
                    if country == "UK":
                        raw_prospects.extend(_scrape_yell_uk(listing_page, per_country))
                    elif country in ("US", "AU"):
                        raw_prospects.extend(_scrape_yelp(listing_page, country, per_country))
                    elif country == "CA":
                        raw_prospects.extend(_scrape_yellowpages_ca(listing_page, per_country))
                except Exception as exc:  # noqa: BLE001
                    print(f"[scraper] {country} directory error: {exc}")

            print(f"[scraper] Found {len(raw_prospects)} listings. Hunting for emails…")

            for prospect in raw_prospects:
                website = (prospect.get("website_url") or "").strip()
                if not website or not website.startswith("http"):
                    continue

                # Validate domain looks real
                try:
                    parsed = urlparse(website)
                    if not parsed.netloc or len(parsed.netloc) < 4:
                        continue
                except Exception:  # noqa: BLE001
                    continue

                # Find email on the business website
                email: str | None = None
                try:
                    if _safe_goto(detail_page, website, timeout=12_000):
                        time.sleep(0.8)
                        email = _find_email_on_website(detail_page, website)
                except Exception:  # noqa: BLE001
                    pass

                if not email:
                    continue

                # Insert — unique constraint on lower(email) prevents duplicates
                try:
                    sb.table("outreach_prospects").insert(
                        {
                            "name": prospect["name"],
                            "email": email,
                            "website_url": website,
                            "phone": prospect.get("phone") or "",
                            "city": prospect.get("city") or "",
                            "country": prospect.get("country") or "UK",
                            "source": prospect.get("source") or "scraper",
                            "status": "scraped",
                            "raw": prospect.get("raw") or {},
                        }
                    ).execute()
                    inserted += 1
                    print(f"[scraper] + {prospect['name']} <{email}>")
                except Exception as exc:  # noqa: BLE001
                    err = str(exc)
                    if "duplicate" in err.lower() or "unique" in err.lower():
                        pass  # already in DB — skip silently
                    else:
                        print(f"[scraper] Insert error for {prospect['name']}: {exc}")

        finally:
            browser.close()

    print(f"[scraper] Done — {inserted} new prospects inserted.")
    return inserted
