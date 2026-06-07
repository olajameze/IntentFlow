"""Load persisted A/B subject winner from app_settings."""

from __future__ import annotations

from typing import Literal

Winner = Literal["A", "B"]


def apply_ab_winner_subjects(
    subject_a: str,
    subject_b: str,
    winner: Winner | None,
) -> tuple[str, str]:
    """Return (primary_subject, challenger_subject) for draft persistence."""
    if winner == "B" and subject_b:
        return subject_b, subject_a
    return subject_a, subject_b


def load_ab_winner(campaign_id: str) -> Winner | None:
    try:
        from supabase_client import get_supabase

        key = f"outreach_ab_winner_{campaign_id.strip().lower()}"
        sb = get_supabase()
        row = sb.table("app_settings").select("value").eq("key", key).maybe_single().execute()
        if not row.data:
            return None
        value = row.data.get("value") or {}
        winner = value.get("winner") if isinstance(value, dict) else None
        if winner in ("A", "B"):
            return winner
    except Exception:
        return None
    return None
