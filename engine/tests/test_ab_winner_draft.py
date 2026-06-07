"""A/B winner subject swap for outreach drafts."""

from tools.ab_winner import apply_ab_winner_subjects


def test_no_winner_keeps_primary_a():
    primary, challenger = apply_ab_winner_subjects("Subject A", "Subject B", None)
    assert primary == "Subject A"
    assert challenger == "Subject B"


def test_winner_a_keeps_order():
    primary, challenger = apply_ab_winner_subjects("Subject A", "Subject B", "A")
    assert primary == "Subject A"
    assert challenger == "Subject B"


def test_winner_b_swaps_primary():
    primary, challenger = apply_ab_winner_subjects("Subject A", "Subject B", "B")
    assert primary == "Subject B"
    assert challenger == "Subject A"
