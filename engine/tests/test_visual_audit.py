"""Visual audit signal and observation tests."""

from tools.site_score_snapshot import build_site_score_payload, compute_site_score_breakdown
from tools.visual_audit import (
    classify_page_status,
    generate_observations,
    template_observations,
    visual_audit_enabled,
)


def test_visual_audit_enabled_jgdevs_only():
    assert visual_audit_enabled("jgdevs") is True
    assert visual_audit_enabled("pesttrace") is False


def test_classify_page_status():
    assert classify_page_status("", "", navigated=False) == "unreachable"
    assert classify_page_status("Buy this domain", "domain for sale", navigated=True) == "parked"
    assert classify_page_status("Acme Plumbing", "Welcome to our services " * 10, navigated=True) == "ok"


def test_template_observations_missing_viewport():
    signals = {"has_viewport_meta": False, "form_count": 0, "tel_links": 0, "load_time_ms": 5000}
    obs = template_observations(signals, "ok")
    assert len(obs) == 3
    assert any("viewport" in o.lower() or "phone" in o.lower() for o in obs)


def test_generate_observations_unreachable():
    obs = generate_observations(
        screenshot_bytes=None,
        signals={},
        page_text="",
        page_status="unreachable",
        company="Test Co",
        website="https://example.com",
    )
    assert len(obs) == 3


def test_site_score_uses_visual_audit_signals():
    research = {
        "page_text_sample": "welcome",
        "page_text_length": 150,
        "has_https": True,
        "has_contact_page": False,
        "visual_audit": {
            "page_status": "ok",
            "observations": [
                "No mobile viewport tag detected.",
                "No booking form on the homepage.",
                "The headline is unclear.",
            ],
            "signals": {
                "has_viewport_meta": False,
                "form_count": 0,
                "tel_links": 0,
                "load_time_ms": 5000,
                "h1": "",
            },
        },
    }
    breakdown = compute_site_score_breakdown(research)
    assert breakdown["mobile_experience"] < 55
    assert breakdown["booking_enquiry_flow"] < 50

    prospect = {
        "name": "Local Plumber",
        "website_url": "https://example.com",
        "country": "UK",
        "city": "Birmingham",
        "sector": "tradesperson",
    }
    payload = build_site_score_payload(prospect, research)
    assert payload.get("visual_audit") is not None
    assert len(payload["visual_audit"]["observations"]) == 3
    assert len(payload["gaps"]) >= 3
    assert payload["gaps"][0]["id"].startswith("visual-")
