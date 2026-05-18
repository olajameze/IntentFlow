"""Scrape pest control business websites and extract contact emails.

Strategy (works without being blocked):
  1. Use DuckDuckGo search to find pest control business websites per city/country.
  2. For each result URL, use requests to visit the site and hunt for a contact email.
  3. Skip councils, aggregators, Wikipedia, and government sites.
  4. Insert new prospects into outreach_prospects (unique on email).

No Playwright needed — DuckDuckGo + requests is far more reliable.
"""

from __future__ import annotations

import re
import sys
import time
from pathlib import Path
from urllib.parse import urljoin, urlparse

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from config import outreach_scrape_limit
from supabase_client import get_supabase


# ── Safe print (ASCII-safe for Windows cp1252 terminals) ─────────────────────

def _p(msg: str) -> None:
    print(msg)


# ── Email extraction ─────────────────────────────────────────────────────────

_EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}", re.IGNORECASE)

_JUNK = re.compile(
    r"(example\.com|sentry|noreply|no-reply|donotreply|@2x|\.png|\.jpg|\.gif|\.svg|wix|wordpress|squarespace)",
    re.IGNORECASE,
)

_SKIP_DOMAINS = re.compile(
    r"(gov\.uk|gov\.au|gov\.ca|\.gov\.|council\.|nhs\.|wikipedia|yelp\.|yell\.|checkatrade|trustmark|"
    r"checktrade|google\.|facebook\.|twitter\.|instagram\.|linkedin\.|youtube\.)",
    re.IGNORECASE,
)

_PREFERRED_LOCAL = re.compile(r"^(info|contact|hello|enquiries|admin|office|mail|team|pest)@", re.IGNORECASE)


def _extract_emails(html: str) -> list[str]:
    found = _EMAIL_RE.findall(html)
    clean = []
    for e in found:
        e = e.lower().strip(".,;:")
        if _JUNK.search(e):
            continue
        if len(e) > 80 or "@" not in e:
            continue
        domain = e.split("@")[-1]
        if "." not in domain:
            continue
        clean.append(e)
    return list(dict.fromkeys(clean))


def _best_email(emails: list[str]) -> str | None:
    if not emails:
        return None
    for e in emails:
        if _PREFERRED_LOCAL.match(e):
            return e
    return emails[0]


# ── HTTP fetch ────────────────────────────────────────────────────────────────

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-GB,en;q=0.9",
}


def _fetch(url: str, timeout: int = 10) -> str:
    try:
        import requests
        r = requests.get(url, headers=_HEADERS, timeout=timeout, allow_redirects=True)
        return r.text
    except Exception:  # noqa: BLE001
        return ""


def _find_email_on_site(base_url: str) -> str | None:
    """Fetch homepage + /contact page and return best contact email."""
    html = _fetch(base_url)
    def _emails_from_html(source: str) -> list[str]:
        """Extract and validate emails from both raw text and mailto: hrefs."""
        raw_text_emails = _extract_emails(source)
        mailto_candidates = [
            m.group(1).split("?")[0].strip().lower()
            for m in re.finditer(r'mailto:([^\s"\'<>?&]+)', source, re.IGNORECASE)
        ]
        # Validate mailto candidates through the same regex + junk filter
        mailto_emails = _extract_emails(" ".join(mailto_candidates))
        return list(dict.fromkeys(raw_text_emails + mailto_emails))

    emails = _emails_from_html(html)
    best = _best_email(emails)
    if best:
        return best

    # Try contact pages
    for slug in ("/contact", "/contact-us", "/get-in-touch", "/about", "/about-us"):
        contact_html = _fetch(urljoin(base_url.rstrip("/"), slug), timeout=8)
        if not contact_html:
            continue
        best2 = _best_email(_emails_from_html(contact_html))
        if best2:
            return best2

    return None


# ── Search queries per country ────────────────────────────────────────────────

_QUERIES: dict[str, list[tuple[str, str]]] = {
    "UK": [
        ("pest control London site:.co.uk",         "London"),
        ("pest control Manchester site:.co.uk",     "Manchester"),
        ("pest control Birmingham site:.co.uk",     "Birmingham"),
        ("pest control Bristol site:.co.uk",        "Bristol"),
        ("pest control Leeds site:.co.uk",          "Leeds"),
        ("pest control Sheffield site:.co.uk",      "Sheffield"),
        ("pest control Glasgow site:.co.uk",        "Glasgow"),
        ("pest control Edinburgh site:.co.uk",      "Edinburgh"),
        ("pest control Liverpool site:.co.uk",      "Liverpool"),
        ("pest control Nottingham site:.co.uk",     "Nottingham"),
        ("pest control Leicester site:.co.uk",      "Leicester"),
        ("pest control Southampton site:.co.uk",    "Southampton"),
    ],
    "US": [
        ("local pest control company New York contact email",     "New York"),
        ("local pest control company Los Angeles contact email",  "Los Angeles"),
        ("local pest control company Chicago contact email",      "Chicago"),
        ("local pest control company Houston contact email",      "Houston"),
        ("local pest control company Phoenix contact email",      "Phoenix"),
        ("local pest control company Philadelphia contact email", "Philadelphia"),
        ("local pest control company San Antonio contact",        "San Antonio"),
        ("local pest control company Dallas contact email",       "Dallas"),
    ],
    "CA": [
        ("pest control company Toronto site:.ca",   "Toronto"),
        ("pest control company Vancouver site:.ca", "Vancouver"),
        ("pest control company Calgary site:.ca",   "Calgary"),
        ("pest control company Ottawa site:.ca",    "Ottawa"),
        ("pest control company Montreal site:.ca",  "Montreal"),
        ("pest control company Edmonton site:.ca",  "Edmonton"),
    ],
    "AU": [
        ("pest control company Sydney site:.com.au",    "Sydney"),
        ("pest control company Melbourne site:.com.au", "Melbourne"),
        ("pest control company Brisbane site:.com.au",  "Brisbane"),
        ("pest control company Perth site:.com.au",     "Perth"),
        ("pest control company Adelaide site:.com.au",  "Adelaide"),
        ("pest control company Canberra site:.com.au",  "Canberra"),
    ],
}


def _is_skippable_url(url: str) -> bool:
    """Return True for government, aggregator, social, or non-business URLs."""
    if not url or not url.startswith("http"):
        return True
    if _SKIP_DOMAINS.search(url):
        return True
    # Skip obvious aggregators / review sites
    skip_keywords = ("finder", "nearme", "directory", "listingsuk", "localservices",
                     "bark.com", "rated.com", "ratedpeople", "trustatrader",
                     "mybuilder", "quotatis", "homeadvisor", "angi.com")
    lower = url.lower()
    return any(k in lower for k in skip_keywords)


def _ddg_search(query: str, country_code: str, max_results: int = 8) -> list[str]:
    """Search DuckDuckGo using both backends and return deduplicated result URLs.

    Runs the query twice — once with the default backend, once with the 'html'
    backend — to get broader coverage. Results from both are merged and deduped.
    """
    from ddgs import DDGS

    region_map = {"UK": "uk-en", "US": "us-en", "CA": "ca-en", "AU": "au-en"}
    region = region_map.get(country_code, "wt-wt")
    seen: set[str] = set()
    results: list[str] = []

    def _collect(backend: str) -> None:
        try:
            with DDGS() as ddg:
                kwargs: dict = dict(region=region, safesearch="off", max_results=max_results)
                if backend != "default":
                    kwargs["backend"] = backend
                for r in ddg.text(query, **kwargs):
                    url = r.get("href") or r.get("url") or ""
                    if not url or _is_skippable_url(url):
                        continue
                    parsed = urlparse(url)
                    root = f"{parsed.scheme}://{parsed.netloc}"
                    if root not in seen:
                        seen.add(root)
                        results.append(root)
        except Exception as exc:  # noqa: BLE001
            _p(f"  [ddg/{backend}] Search error: {exc}")

    _collect("default")
    time.sleep(0.8)  # avoid rate limiting between two rapid calls
    _collect("html")

    return results


# ── Main entry point ──────────────────────────────────────────────────────────

def scrape_prospects(countries: list[str] | None = None) -> int:
    """Search DuckDuckGo for pest control businesses and extract contact emails.

    Returns number of newly inserted prospects.
    """
    target_countries = [c.upper() for c in (countries or ["UK", "US", "CA", "AU"])]
    limit = outreach_scrape_limit()
    per_country = max(3, limit // max(1, len(target_countries)))

    sb = get_supabase()
    inserted = 0
    total_searched = 0

    for country in target_countries:
        queries = _QUERIES.get(country, [])
        country_inserted = 0
        _p(f"\n[scraper] ── {country} (target {per_country}) ──")

        for query, city in queries:
            if country_inserted >= per_country:
                break

            _p(f"  [ddg] '{query}'")
            urls = _ddg_search(query, country, max_results=6)
            _p(f"  [ddg] {len(urls)} candidate URLs")
            time.sleep(1.5)  # be polite to DuckDuckGo

            for url in urls:
                if country_inserted >= per_country:
                    break
                total_searched += 1

                # Extract business name from domain
                try:
                    netloc = urlparse(url).netloc.replace("www.", "")
                    name_guess = netloc.split(".")[0].replace("-", " ").replace("_", " ").title()
                except Exception:  # noqa: BLE001
                    name_guess = url

                _p(f"    [{total_searched}] {name_guess} ({url})")

                # Hunt for email
                email = _find_email_on_site(url)
                if not email:
                    _p(f"      → no email found")
                    time.sleep(0.3)
                    continue

                _p(f"      → email: {email}")

                # Insert into DB
                try:
                    sb.table("outreach_prospects").insert({
                        "name": name_guess,
                        "email": email,
                        "website_url": url,
                        "phone": "",
                        "city": city,
                        "country": country,
                        "source": f"ddg_{country.lower()}",
                        "status": "scraped",
                        "raw": {"query": query},
                    }).execute()
                    inserted += 1
                    country_inserted += 1
                    _p(f"      + Saved: {name_guess} <{email}>")
                except Exception as exc:  # noqa: BLE001
                    err = str(exc).lower()
                    if "duplicate" in err or "unique" in err:
                        _p(f"      (duplicate — already in DB)")
                    else:
                        _p(f"      Insert error: {exc}")

                time.sleep(0.5)

    _p(f"\n[scraper] Done — {inserted} new prospects inserted.")
    return inserted
