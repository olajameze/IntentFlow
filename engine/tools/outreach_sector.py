"""Classify a scraped prospect into one of a fixed sector vocabulary.

Driven by heuristics (regex on business name + search query + URL) — no LLM call —
so we don't burn Groq budget on what is essentially a one-line classification.

Sectors map to the per-sector "angle" strings in
``engine.tools.outreach_campaigns`` so the email LLM can produce sector-specific copy
(Klaviyo step 5: define your audiences so you can personalise for them).
"""

from __future__ import annotations

import re
from typing import Iterable


# Order matters — first match wins. Put high-confidence sectors before generic ones.
_SECTOR_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("pet_groomer",    re.compile(r"\b(grooming|groomer|kennels|cattery|boarding|pet)\b",                       re.IGNORECASE)),
    ("hotel",          re.compile(r"\b(hotel|guest\s?house|b&b|bed\s?and\s?breakfast|inn|lodge)\b",            re.IGNORECASE)),
    ("care_home",      re.compile(r"\b(care\s?home|nursing\s?home|residential\s?home|dementia|assisted\s?living)\b", re.IGNORECASE)),
    ("school",         re.compile(r"\b(nursery|school|college|academy|montessori|childcare|kindergarten)\b",   re.IGNORECASE)),
    ("letting_agent",  re.compile(r"\b(letting|estate\s?agent|property\s?management|landlord|lettings)\b",      re.IGNORECASE)),
    ("pub",            re.compile(r"\b(pub|bar|tavern|club|inn|brewery)\b",                                     re.IGNORECASE)),
    ("gym",            re.compile(r"\b(gym|fitness|leisure\s?centre|leisure\s?center|crossfit|spa)\b",          re.IGNORECASE)),
    ("bakery",         re.compile(r"\b(bakery|bake|patisserie)\b",                                              re.IGNORECASE)),
    ("food_production",re.compile(r"\b(food\s?production|food\s?manufactur|food\s?process|abattoir|butcher)\b", re.IGNORECASE)),
    ("restaurant",     re.compile(r"\b(restaurant|cafe|café|bistro|takeaway|takeout|eatery|kitchen|food|dine)\b", re.IGNORECASE)),
    ("pest_control_firm", re.compile(r"\b(pest\s?control|exterminat|pest\s?management)\b",                     re.IGNORECASE)),
)


def classify_sector(*hints: str | None) -> str:
    """Return a sector id (e.g. ``"hotel"``) given any number of free-text hints.

    Hints can be the business name, the original search query, the scraped URL, or
    any other tag. Empty / None hints are skipped. Falls back to ``"generic"`` when
    nothing matches.
    """
    blob = " ".join(h for h in hints if h)
    if not blob.strip():
        return "generic"
    for sector_id, pattern in _SECTOR_PATTERNS:
        if pattern.search(blob):
            return sector_id
    return "generic"


def classify_many(hints_per_row: Iterable[tuple[str, ...]]) -> list[str]:
    """Convenience helper for batch classification — mostly for tests."""
    return [classify_sector(*row) for row in hints_per_row]


__all__ = ["classify_sector", "classify_many"]
