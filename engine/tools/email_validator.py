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

AI_LEAK_PHRASES: tuple[str, ...] = (
    "professional outreach email",
    "professional b2b outreach email",
    "b2b outreach email",
    "draft email",
    "as requested",
    "as instructed",
    "following are",
    "target audience:",
    "strategy:",
    "return json",
    "uk english",
)

AI_PREAMBLE_META_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"^here is the (professional|draft|cold|b2b|outreach)", re.I),
    re.compile(r"^here are (the|two|both|some|following)", re.I),
    re.compile(r"^below is (the|a) (draft|email|professional)", re.I),
    re.compile(r"^below are (the|two|following)", re.I),
    re.compile(r"^following is (the|a)", re.I),
    re.compile(r"^following are (the|two)", re.I),
)

AI_PREAMBLE_LINE_PHRASES: tuple[str, ...] = (
    "i'd be happy to",
    "i would be happy to",
    "i hope this email finds you well",
    "just reaching out",
    "i wanted to touch base",
    "circling back",
    "as instructed",
    "as requested",
)

WORD_LIMITS: dict[str, int] = {"initial": 260, "followup": 100}

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


_PORTFOLIO_URL_HOSTS = (
    "pesttrace.com",
    "weatherspestsolutions.co.uk",
    "jgdev.co.uk",
)


def _is_template_or_portfolio_url(raw: str) -> bool:
    trimmed = raw.strip().rstrip(".,;:!?)")
    try:
        href = f"https://{trimmed}" if trimmed.lower().startswith("www.") else trimmed
        from urllib.parse import urlparse

        parsed = urlparse(href)
        host = (parsed.hostname or "").lower().removeprefix("www.")
        if any(host == d or host.endswith(f".{d}") for d in _PORTFOLIO_URL_HOSTS):
            return True
        path = (parsed.path or "").lower()
        if path.startswith("/r/") or path.startswith("/q/") or "/api/outreach-track/" in path:
            return True
    except Exception:  # noqa: BLE001
        return False
    return False


def _strip_signoff_url_lines(text: str) -> str:
    lines = []
    for line in text.split("\n"):
        t = line.strip()
        if re.fullmatch(r"https?://\S+", t, re.I) or re.fullmatch(r"www\.\S+", t, re.I):
            continue
        lines.append(line)
    return "\n".join(lines)


def _count_urls(text: str) -> int:
    cleaned = _strip_signoff_url_lines(text)
    matches = re.findall(r"https?://[^\s<>\"']+|www\.[^\s<>\"']+", cleaned, re.I)
    return sum(1 for m in matches if not _is_template_or_portfolio_url(m))


def _has_shouty_all_caps_words(text: str) -> bool:
    # Subjects only — bodies may cite BRCGS, HACCP, HTTPS, etc.
    return bool(re.search(r"\b[A-Z]{6,}\b", text))


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


def _body_preamble_text(body: str) -> str:
    lines = body.replace("\r\n", "\n").split("\n")
    return "\n".join(lines[:2])[:320]


def _contains_ai_phrase_in_body(body: str) -> str | None:
    leak = _contains_blocked_phrase(body, AI_LEAK_PHRASES)
    if leak:
        return leak
    preamble = _body_preamble_text(body)
    for line in preamble.split("\n"):
        trimmed = line.strip()
        if not trimmed:
            continue
        for pattern in AI_PREAMBLE_META_PATTERNS:
            if pattern.search(trimmed):
                return trimmed[:40]
        line_hit = _contains_blocked_phrase(trimmed, AI_PREAMBLE_LINE_PHRASES)
        if line_hit:
            return line_hit
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
        ai = _contains_ai_phrase_in_body(bod) if field == bod else _contains_blocked_phrase(field, AI_PHRASE_BLOCKLIST)
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
    if _has_shouty_all_caps_words(sub):
        issues.append("Subject contains excessive capitalization")
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
    for pattern in AI_PREAMBLE_META_PATTERNS:
        if pattern.search(t):
            return True
    if re.search(r"professional.*(b2b\s*)?outreach.*email", t, re.I) and len(t) < 160:
        return True
    if _contains_blocked_phrase(t, AI_PREAMBLE_LINE_PHRASES):
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


def strip_markdown_formatting(text: str) -> str:
    text = re.sub(r"\*\*\*([^*]+)\*\*\*", r"\1", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)
    text = re.sub(r"(?<![*])\*(?![*])([^*\n]+)\*(?![*])", r"\1", text)
    text = re.sub(r"^#{1,6}\s+", "", text, flags=re.M)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    return re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r"\1", text)


def normalize_outreach_body(body: str) -> str:
    return strip_markdown_formatting(strip_ai_meta_preamble(re.sub(r"\n{3,}", "\n\n", body).strip()))


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
