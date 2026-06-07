"""Lead scoring parity tests."""

from tools.lead_scoring import compute_lead_score


def test_lead_score_cap_and_boost():
    prospect = {
        "campaign": "pesttrace",
        "sector": "pest_control_firm",
        "email": "contact@example.de",
        "country": "DE",
        "city": "Berlin",
        "phone": "",
    }
    research = {
        "services": ["rodent", "wasp"],
        "has_https": True,
        "has_contact_page": True,
        "page_text_length": 2500,
        "contact_name": "Hans Mueller",
        "page_text_sample": "compliance audit documentation",
    }
    score, breakdown = compute_lead_score(prospect, research)
    assert 0 < score <= 100
    assert breakdown["research_boost"] >= 10
