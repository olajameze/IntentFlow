"""Risk brief and site score snapshot tests."""

from tools.risk_brief_snapshot import (
    build_risk_brief_payload,
    compute_overall_risk,
    compute_risk_breakdown,
)
from tools.site_score_snapshot import (
    build_site_score_payload,
    compute_overall_site_score,
    compute_site_score_breakdown,
)


def test_risk_brief_breakdown_and_payload():
    research = {
        "page_text_sample": "restaurant kitchen food hygiene menu",
        "page_text_length": 200,
    }
    prospect = {
        "name": "Test Bistro",
        "website_url": "https://example.com",
        "country": "UK",
        "city": "Birmingham",
        "sector": "restaurant",
    }
    breakdown = compute_risk_breakdown(research, "restaurant")
    assert all(0 <= v <= 100 for v in breakdown.values())
    overall = compute_overall_risk(breakdown)
    assert 0 <= overall <= 100

    payload = build_risk_brief_payload(prospect, research)
    assert payload["snapshot_type"] == "risk_brief"
    assert payload["company_name"] == "Test Bistro"
    assert len(payload["gaps"]) >= 3
    assert len(payload["seasonal_risks"]) >= 1


def test_site_score_breakdown_and_payload():
    research = {
        "page_text_sample": "welcome to our shop",
        "page_text_length": 150,
        "has_https": False,
        "has_contact_page": False,
    }
    prospect = {
        "name": "Local Plumber",
        "website_url": "http://example.de",
        "country": "DE",
        "city": "Berlin",
        "sector": "tradesperson",
    }
    breakdown = compute_site_score_breakdown(research)
    assert breakdown["mobile_experience"] < 60
    overall = compute_overall_site_score(breakdown)
    assert 0 <= overall <= 100

    payload = build_site_score_payload(prospect, research)
    assert payload["snapshot_type"] == "site_score"
    assert payload["country"] == "DE"
    assert len(payload["gaps"]) >= 3
    assert len(payload["recommendations"]) >= 2
    assert payload.get("visual_audit") is None


def test_site_score_payload_includes_visual_audit():
    research = {
        "page_text_sample": "plumber services contact",
        "page_text_length": 400,
        "has_https": True,
        "has_contact_page": True,
        "visual_audit": {
            "page_status": "ok",
            "observations": [
                "No mobile viewport tag detected.",
                "No booking form on the homepage.",
                "The headline is unclear.",
            ],
            "screenshot_path": "jgdevs/33333333-3333-3333-3333-333333333333/mobile.webp",
            "load_time_ms": 3200,
            "signals": {
                "has_viewport_meta": False,
                "form_count": 0,
                "tel_links": 0,
                "h1": "",
            },
        },
    }
    prospect = {
        "name": "Local Plumber",
        "website_url": "https://example.co.uk",
        "country": "UK",
        "city": "Leeds",
        "sector": "tradesperson",
    }
    breakdown = compute_site_score_breakdown(research)
    assert breakdown["mobile_experience"] < 60

    payload = build_site_score_payload(prospect, research)
    assert payload["visual_audit"] is not None
    assert payload["visual_audit"]["page_status"] == "ok"
    assert len(payload["visual_audit"]["observations"]) == 3
    assert payload["gaps"][0]["id"].startswith("visual-")
