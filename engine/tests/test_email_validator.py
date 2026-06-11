"""Parity tests for email_validator — mirrors web email-validator.test.ts."""

from __future__ import annotations

import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from tools.email_validator import validate_outreach_copy  # noqa: E402

CLEAN_SUBJECT = "Audit readiness for your pest control operation"
CLEAN_BODY = (
    "Hi Acme Pest,\n\n"
    "Many operators in your sector struggle with inspection paperwork when regulators visit. "
    "PestTrace keeps treatment logs and certificates in one place.\n\n"
    "Would a short call next week be useful?\n\n"
    "Best,\nThe PestTrace Team"
)


def test_accepts_clean_copy():
    ok, issues = validate_outreach_copy(CLEAN_SUBJECT, CLEAN_BODY, "initial")
    assert ok is True
    assert issues == []


def test_rejects_here_is():
    ok, issues = validate_outreach_copy(
        "Quick question",
        "Here is the professional outreach email for your review.\n\nHi there...",
        "initial",
    )
    assert ok is False
    assert any("here is" in i or "professional outreach email" in i for i in issues)


def test_rejects_below_is_and_certainly():
    ok1, _ = validate_outreach_copy("Subject", "Below is a draft for your team.", "initial")
    assert ok1 is False
    ok2, _ = validate_outreach_copy("Subject", "Certainly, I can help with compliance.", "initial")
    assert ok2 is True


def test_allows_legitimate_here_is_in_body():
    body = (
        "Here is a seasonal pest risk brief we prepared for your team.\n\n"
        "The main pressure point here is rodent activity as weather cools."
    )
    ok, issues = validate_outreach_copy("Seasonal pest risk?", body, "initial")
    assert ok is True
    assert issues == []


def test_rejects_markdown_and_json():
    ok_md, _ = validate_outreach_copy("Sub", "**Bold** claim about services.", "initial")
    assert ok_md is False
    ok_json, _ = validate_outreach_copy("Sub", '{"subject":"Hi","body":"Hello"}', "initial")
    assert ok_json is False


def test_rejects_draft_placeholder():
    ok, _ = validate_outreach_copy("Sub", "[Draft — configure LLM fallback]", "initial")
    assert ok is False


def test_followup_word_limit():
    long_body = " ".join(["word"] * 101)
    ok, issues = validate_outreach_copy("Follow up", long_body, "followup")
    assert ok is False
    assert any("word limit" in i for i in issues)
