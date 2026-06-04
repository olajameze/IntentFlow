"""Locale rules for cold outreach — avoids assuming UK when targeting EU / Asia."""

from __future__ import annotations

# Appended to LLM calls alongside OUTREACH_CONVERSION_DOCTRINE.
LOCALE_RULES_TEMPLATE = """
Recipient market country code: {country}
- Use professional English matched to that market (US/CA/AU: American English; UK/IE: British English; DE/FR/ES/IT/NL and other EU: clear international English).
- Do NOT mention the United Kingdom, UK, or "UK pest control" unless the country code is exactly UK.
- Name regulators only when credible for that market: BRCGS/SALSA/BPCA/BS EN 16636 (UK); EU biocide/PPP and audit record expectations (DE, FR, ES, IT, NL, IE); FSSAI/state food-safety audits (IN); EPA/state licensing (US).
- PestTrace is for pest control operators globally — never imply the product is UK-only.
""".strip()


def normalize_outreach_country(code: str | None) -> str:
    c = (code or "").strip().upper()
    return c if c else "INT"


def locale_rules_for_country(country: str | None) -> str:
    return LOCALE_RULES_TEMPLATE.format(country=normalize_outreach_country(country))
