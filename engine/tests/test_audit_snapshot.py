"""Audit snapshot scoring and payload tests."""

from tools.audit_snapshot import (
    build_snapshot_payload,
    compute_overall_score,
    compute_score_breakdown,
    market_frameworks_for_country,
    template_gaps,
)


def test_market_frameworks_uk_vs_de():
    uk = market_frameworks_for_country("UK")
    de = market_frameworks_for_country("DE")
    assert "BRCGS" in uk
    assert "BRCGS" not in de
    assert any("EU" in f for f in de)


def test_score_breakdown_deterministic():
    research = {
        "page_text_sample": "compliance audit digital logbook certified BPCA",
        "page_text_length": 3000,
        "has_https": True,
        "has_contact_page": True,
    }
    breakdown = compute_score_breakdown(research, "UK")
    assert all(0 <= v <= 100 for v in breakdown.values())
    overall = compute_overall_score(breakdown)
    assert 0 <= overall <= 100


def test_low_content_lowers_documentation_score():
    sparse = {
        "page_text_sample": "welcome to our site",
        "page_text_length": 200,
        "has_https": False,
        "has_contact_page": False,
    }
    rich = {
        "page_text_sample": "compliance audit haccp digital app logbook certified",
        "page_text_length": 4000,
        "has_https": True,
        "has_contact_page": True,
    }
    sparse_score = compute_score_breakdown(sparse, "UK")["documentation_visibility"]
    rich_score = compute_score_breakdown(rich, "UK")["documentation_visibility"]
    assert rich_score > sparse_score


def test_template_gaps_count():
    breakdown = {
        "documentation_visibility": 40,
        "digital_evidence_trail": 35,
        "qualification_tracking": 55,
        "audit_readiness_signals": 45,
    }
    gaps = template_gaps(breakdown, ["BRCGS"])
    assert 3 <= len(gaps) <= 5
    assert all(g["severity"] in {"high", "medium", "low"} for g in gaps)


def test_build_snapshot_payload_without_llm():
    prospect = {
        "name": "Acme Pest Ltd",
        "website_url": "https://acmepest.example",
        "country": "UK",
        "city": "Birmingham",
        "sector": "pest_control_firm",
    }
    research = {
        "page_text_sample": "pest control rodent wasp",
        "page_text_length": 800,
        "has_https": True,
        "has_contact_page": True,
        "services": ["Rodent control"],
    }
    payload = build_snapshot_payload(prospect, research, use_llm=False)
    assert payload["version"] == 1
    assert payload["company_name"] == "Acme Pest Ltd"
    assert 0 <= payload["overall_score"] <= 100
    assert 3 <= len(payload["gaps"]) <= 5
    assert 2 <= len(payload["recommendations"]) <= 3
    assert "not a formal audit" in payload["disclaimer"].lower()
