"""Validate outreach email copy — mirrors web/src/lib/outreach/email-validator.ts."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Literal

OutreachCopyKind = Literal["initial", "followup"]

_BLOCKLIST_PATH = Path(__file__).resolve().parents[1] / "data" / "email-blocklist.json"

with _BLOCKLIST_PATH.open(encoding="utf-8") as f:
    _BLOCKLIST = json.load(f)

AI_PHRASE_BLOCKLIST: tuple[str, ...] = tuple(_BLOCKLIST["phrases"])
SPAM_TRIGGERS: tuple[str, ...] = tuple(_BLOCKLIST["spam_triggers"])

WORD_LIMITS: dict[str, int] = {"initial": 180, "followup": 90}

_MARKDOWN_PATTERNS = [
    re.compile(r"\*\*[^*]+\*\*"),
    re.compile(r"^#{1,6}\s", re.M),
    re.compile(r"`[^`]+`"),
    re.compile(r"\[[^\]]+\]\([^)]+\)"),
]

_JSON_PATTERNS = [
    re.compile(r"^\s*[\[{]"),
    re.compile(r'"subject"\s*:', re.I),
    re.compile(r'"body"\s*:', re.I),
    re.compile(r'"name"\s*:'),
    re.compile(r'"website"\s*:'),
]


def _word_count(text: str) -> int:
    return len([w for w in text.strip().split() if w])


def _count_urls(text: str) -> int:
    return len(re.findall(r"https?://[^\s]+|www\.[^\s]+", text, re.I))


def _has_all_caps_words(text: str) -> bool:
    return bool(re.search(r"\b[A-Z]{4,}\b", text))


def _has_duplicate_sentence(text: str) -> bool:
    sentences = [
        s.strip().lower()
        for s in re.split(r"[.!?]+", text)
        if len(s.strip()) > 20
    ]
    seen: set[str] = set()
    for s in sentences:
        if s in seen:
            return True
        seen.add(s)
    return False


def _contains_blocked_phrase(text: str, phrases: tuple[str, ...]) -> str | None:
    low = text.lower()
    for phrase in phrases:
        escaped = re.escape(phrase)
        if re.search(rf"(?:^|[^a-z]){escaped}(?:[^a-z]|$)", low):
            return phrase
    return None


def validate_outreach_copy(
    subject: str,
    body: str,
    kind: OutreachCopyKind = "initial",
) -> tuple[bool, list[str]]:
    """Return (ok, issues)."""
    issues: list[str] = []
    sub = subject.strip()
    bod = body.strip()

    if not sub:
        issues.append("Subject is empty")
    if not bod:
        issues.append("Body is empty")
    if bod.startswith("[Draft"):
        issues.append("Body is a draft placeholder")
    if sub.startswith("[Draft"):
        issues.append("Subject is a draft placeholder")

    for field in (sub, bod):
        ai = _contains_blocked_phrase(field, AI_PHRASE_BLOCKLIST)
        if ai:
            issues.append(f'AI assistant phrase detected: "{ai}"')
        spam = _contains_blocked_phrase(field, SPAM_TRIGGERS)
        if spam:
            issues.append(f'Spam trigger detected: "{spam}"')

    for pattern in _MARKDOWN_PATTERNS:
        if pattern.search(bod):
            issues.append("Body contains markdown formatting")
            break

    for pattern in _JSON_PATTERNS:
        if pattern.search(bod) or pattern.search(sub):
            issues.append("Output contains JSON or structured data leakage")
            break

    if _has_duplicate_sentence(bod):
        issues.append("Body contains duplicated sentences")
    if _count_urls(bod) > 2:
        issues.append("Body contains too many URLs")
    if _has_all_caps_words(sub):
        issues.append("Subject contains excessive capitalization")
    if _has_all_caps_words(bod):
        issues.append("Body contains excessive capitalization")
    if "!" in sub:
        issues.append("Subject contains exclamation mark")

    limit = WORD_LIMITS[kind]
    wc = _word_count(bod)
    if wc > limit:
        issues.append(f"Body exceeds {limit} word limit ({wc} words)")

    return len(issues) == 0, issues


def _is_meta_preamble_line(line: str) -> bool:
    t = line.strip()
    if not t:
        return True
    low = t.lower()
    if re.match(r"^(here (is|are)|below (is|are)|following (is|are))\b", low):
        return True
    if re.search(r"professional.*(b2b\s*)?outreach.*email", t, re.I) and len(t) < 160:
        return True
    if _contains_blocked_phrase(t, AI_PHRASE_BLOCKLIST):
        return True
    return False


def strip_ai_meta_preamble(text: str) -> str:
    lines = text.replace("\r\n", "\n").split("\n")
    while lines and _is_meta_preamble_line(lines[0]):
        lines.pop(0)
    joined = "\n".join(lines).strip()
    inline_lead = re.compile(r"^(here (is|are) the professional[^\n]+)\n?", re.I)
    while inline_lead.match(joined):
        joined = inline_lead.sub("", joined, count=1).strip()
    return re.sub(r"\n{3,}", "\n\n", joined).strip()


def normalize_outreach_body(body: str) -> str:
    return strip_ai_meta_preamble(re.sub(r"\n{3,}", "\n\n", body).strip())


def plain_text_from_html(html: str) -> str:
    text = re.sub(r"<br\s*/?>", "\n", html, flags=re.I)
    text = re.sub(r"</p>", "\n\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    for old, new in (
        ("&nbsp;", " "),
        ("&amp;", "&"),
        ("&lt;", "<"),
        ("&gt;", ">"),
        ("&quot;", '"'),
    ):
        text = text.replace(old, new)
    return re.sub(r"\n{3,}", "\n\n", text).strip()
