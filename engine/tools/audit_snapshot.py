"""Generate PestTrace audit readiness snapshots for outreach prospects."""

from __future__ import annotations

import json
import logging
import os
import re
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from supabase_client import get_supabase
from tools.llm import generate_outreach_copy
from tools.outreach_locale import normalize_outreach_country

logger = logging.getLogger(__name__)

SNAPSHOT_URL_PLACEHOLDER = "__SNAPSHOT_URL__"

_DOC_KEYWORDS = ("compliance", "audit", "haccp", "brcgs", "salsa", "food safety")
_DIGITAL_KEYWORDS = ("digital", "app", "logbook", "software", "mobile", "cloud")
_QUAL_KEYWORDS = ("certified", "bpca", "ipc", "qualified", "qualification", "licensed")

_FORBIDDEN_GAP_PATTERNS = re.compile(
    r"\b(failed audit|lost certification|fined|penalty|client name|customer name)\b",
    re.I,
)


def outreach_snapshot_enabled() -> bool:
    raw = os.getenv("OUTREACH_SNAPSHOT_ENABLED", "1").strip().lower()
    return raw not in {"0", "false", "no", "off"}


def market_frameworks_for_country(country: str) -> list[str]:
    c = normalize_outreach_country(country)
    if c in {"UK", "IE"}:
        return ["BRCGS", "SALSA", "BPCA", "BS EN 16636"]
    if c in {"DE", "FR", "ES", "IT", "NL"}:
        return ["EU biocide/PPP records", "Audit-ready electronic records"]
    if c == "IN":
        return ["FSSAI", "State food-safety audits"]
    if c in {"US", "CA"}:
        return ["EPA/state licensing", "Customer audit documentation"]
    if c == "AU":
        return ["State licensing", "Customer audit documentation"]
    return ["International compliance documentation", "Customer audit expectations"]


def _clamp(n: int) -> int:
    return max(0, min(100, n))


def compute_score_breakdown(research: dict[str, Any], country: str) -> dict[str, int]:
    sample = (research.get("page_text_sample") or "").lower()
    page_len = int(research.get("page_text_length") or 0)
    has_https = bool(research.get("has_https"))
    has_contact = bool(research.get("has_contact_page"))

    doc = 50
    digital = 45
    qual = 50
    audit = 50

    if any(k in sample for k in _DOC_KEYWORDS):
        doc += 15
    if any(k in sample for k in _DIGITAL_KEYWORDS):
        digital += 20
    if any(k in sample for k in _QUAL_KEYWORDS):
        qual += 10
    if has_https:
        audit += 5
    if has_contact:
        audit += 10
    if page_len < 500:
        doc -= 15
    if not has_contact:
        audit -= 10

    c = normalize_outreach_country(country)
    if c in {"UK", "IE"} and not any(k in sample for k in _DOC_KEYWORDS):
        audit -= 10

    return {
        "documentation_visibility": _clamp(doc),
        "digital_evidence_trail": _clamp(digital),
        "qualification_tracking": _clamp(qual),
        "audit_readiness_signals": _clamp(audit),
    }


def compute_overall_score(breakdown: dict[str, int]) -> int:
    weighted = (
        breakdown["documentation_visibility"] * 0.30
        + breakdown["digital_evidence_trail"] * 0.30
        + breakdown["qualification_tracking"] * 0.20
        + breakdown["audit_readiness_signals"] * 0.20
    )
    return _clamp(int(round(weighted)))


def _lowest_dimensions(breakdown: dict[str, int], n: int = 3) -> list[tuple[str, int]]:
    labels = {
        "documentation_visibility": "Documentation visibility",
        "digital_evidence_trail": "Digital evidence trail",
        "qualification_tracking": "Qualification tracking",
        "audit_readiness_signals": "Audit readiness signals",
    }
    ranked = sorted(breakdown.items(), key=lambda x: x[1])
    return [(labels[k], v) for k, v in ranked[:n]]


def template_gaps(
    breakdown: dict[str, int],
    frameworks: list[str],
) -> list[dict[str, str]]:
    framework = frameworks[0] if frameworks else "compliance"
    gaps: list[dict[str, str]] = []
    for i, (label, score) in enumerate(_lowest_dimensions(breakdown, 3)):
        severity = "high" if score < 45 else "medium" if score < 65 else "low"
        gaps.append(
            {
                "id": f"gap-{i + 1}",
                "title": f"Limited signals for {label.lower()}",
                "severity": severity,
                "detail": (
                    f"Public website content shows limited visible mention of {label.lower()} "
                    f"({score}/100). Teams in your market often face pressure under {framework} "
                    f"expectations when evidence is hard to produce quickly."
                ),
                "framework": framework if i == 0 else "",
            }
        )
    return gaps


def template_recommendations(breakdown: dict[str, int]) -> list[str]:
    recs: list[str] = []
    if breakdown["digital_evidence_trail"] < 60:
        recs.append(
            "Move field treatment records into a digital logbook with photos and signatures."
        )
    if breakdown["documentation_visibility"] < 60:
        recs.append(
            "Standardise audit-ready documentation so customer and regulator requests are faster to answer."
        )
    if breakdown["qualification_tracking"] < 60:
        recs.append(
            "Track qualification and certificate expiry in one place to avoid last-minute audit gaps."
        )
    if len(recs) < 2:
        recs.append(
            "Review how treatment evidence is stored today and whether it would hold up under a spot audit."
        )
    return recs[:3]


def _validate_llm_gaps(gaps: list[Any]) -> list[dict[str, str]] | None:
    if not isinstance(gaps, list) or not (3 <= len(gaps) <= 5):
        return None
    clean: list[dict[str, str]] = []
    for i, g in enumerate(gaps):
        if not isinstance(g, dict):
            return None
        title = str(g.get("title") or "").strip()
        detail = str(g.get("detail") or "").strip()
        severity = str(g.get("severity") or "medium").strip().lower()
        if severity not in {"high", "medium", "low"}:
            severity = "medium"
        if not title or not detail or _FORBIDDEN_GAP_PATTERNS.search(detail):
            return None
        clean.append(
            {
                "id": str(g.get("id") or f"gap-{i + 1}"),
                "title": title,
                "severity": severity,
                "detail": detail,
                "framework": str(g.get("framework") or "").strip(),
            }
        )
    return clean


def _llm_gaps_and_recommendations(
    *,
    name: str,
    country: str,
    breakdown: dict[str, int],
    frameworks: list[str],
    research: dict[str, Any],
) -> tuple[list[dict[str, str]] | None, list[str] | None, str | None]:
    services = research.get("services") or []
    services_str = ", ".join(str(s) for s in services[:5]) if services else "pest control services"
    weaknesses = research.get("weaknesses") or []
    weakness_str = ", ".join(str(w) for w in weaknesses[:3]) if weaknesses else "limited public signals"

    prompt = f"""Return JSON only for an audit readiness snapshot (no markdown, no explanation):
{{
  "gaps": [
    {{"id": "gap-1", "title": "short title", "severity": "high|medium|low", "detail": "1-2 sentences", "framework": "optional framework name"}}
  ],
  "recommendations": ["action 1", "action 2"],
  "pesttrace_fit": "2 sentences on how digital logbooks help — calm, peer tone"
}}

Company: {name}
Country: {country}
Services: {services_str}
Score breakdown: {json.dumps(breakdown)}
Market frameworks: {", ".join(frameworks)}
Research weaknesses: {weakness_str}

Rules:
- Provide exactly 3 to 5 gaps.
- Gaps must cite OBSERVABLE signals only ("no visible mention of…", "limited signals of…").
- NEVER invent failed audits, fines, certifications, or client names.
- Do NOT mention UK unless country is UK or IE.
- Recommendations: 2-3 actionable bullets."""

    raw = generate_outreach_copy(
        business_context=json.dumps({"name": name, "country": country}),
        lead=f"Audit snapshot gaps: {name}",
        template=prompt,
    )
    match = re.search(r"\{[\s\S]*\}", raw or "")
    if not match:
        return None, None, None
    try:
        data = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None, None, None
    if not isinstance(data, dict):
        return None, None, None

    gaps = _validate_llm_gaps(data.get("gaps") or [])
    recs_raw = data.get("recommendations")
    recs: list[str] | None = None
    if isinstance(recs_raw, list):
        recs = [str(r).strip() for r in recs_raw if str(r).strip()]
        if not (2 <= len(recs) <= 3):
            recs = None
    fit = str(data.get("pesttrace_fit") or "").strip() or None
    return gaps, recs, fit


def build_snapshot_payload(
    prospect: dict[str, Any],
    research: dict[str, Any],
    *,
    use_llm: bool = True,
) -> dict[str, Any]:
    name = (prospect.get("name") or "").strip() or "Your business"
    website = (prospect.get("website_url") or "").strip() or None
    country = normalize_outreach_country(prospect.get("country"))
    city = (prospect.get("city") or "").strip() or None
    sector = str(prospect.get("sector") or research.get("sector") or "generic").strip().lower()

    frameworks = market_frameworks_for_country(country)
    breakdown = compute_score_breakdown(research, country)
    overall = compute_overall_score(breakdown)

    gaps: list[dict[str, str]]
    recommendations: list[str]
    pesttrace_fit: str

    llm_gaps = llm_recs = llm_fit = None
    if use_llm:
        llm_gaps, llm_recs, llm_fit = _llm_gaps_and_recommendations(
            name=name,
            country=country,
            breakdown=breakdown,
            frameworks=frameworks,
            research=research,
        )

    gaps = llm_gaps if llm_gaps else template_gaps(breakdown, frameworks)
    recommendations = llm_recs if llm_recs else template_recommendations(breakdown)
    pesttrace_fit = llm_fit or (
        "PestTrace gives pest control teams a digital logbook for treatments, photos, "
        "signatures, and follow-ups — so records stay audit-ready without retyping field paperwork."
    )

    now = datetime.now(timezone.utc).isoformat()
    disclaimer = (
        f"Based on publicly available information from {website or 'the business website'}. "
        "This is not a formal audit or certification assessment."
    )

    return {
        "snapshot_type": "audit",
        "version": 1,
        "company_name": name,
        "website": website,
        "country": country,
        "city": city,
        "sector": sector,
        "market_frameworks": frameworks,
        "overall_score": overall,
        "score_breakdown": breakdown,
        "gaps": gaps,
        "recommendations": recommendations,
        "pesttrace_fit": pesttrace_fit,
        "disclaimer": disclaimer,
        "generated_at": now,
    }


def persist_snapshot(
    prospect_id: str,
    campaign: str,
    payload: dict[str, Any],
) -> dict[str, Any] | None:
    """Upsert snapshot row and merge raw.snapshot on prospect."""
    try:
        sb = get_supabase()
        overall = int(payload.get("overall_score") or 0)
        now = datetime.now(timezone.utc).isoformat()

        existing = (
            sb.table("outreach_snapshots")
            .select("id, token")
            .eq("prospect_id", prospect_id)
            .eq("campaign", campaign)
            .limit(1)
            .execute()
        )
        rows = existing.data or []
        if rows:
            snapshot_id = str(rows[0]["id"])
            token = str(rows[0]["token"])
            sb.table("outreach_snapshots").update(
                {
                    "payload": payload,
                    "overall_score": overall,
                    "generated_at": payload.get("generated_at") or now,
                    "updated_at": now,
                }
            ).eq("id", snapshot_id).execute()
        else:
            snapshot_id = str(uuid.uuid4())
            token = str(uuid.uuid4())
            sb.table("outreach_snapshots").insert(
                {
                    "id": snapshot_id,
                    "prospect_id": prospect_id,
                    "campaign": campaign,
                    "token": token,
                    "payload": payload,
                    "overall_score": overall,
                    "generated_at": payload.get("generated_at") or now,
                    "updated_at": now,
                }
            ).execute()

        prospect_row = (
            sb.table("outreach_prospects")
            .select("raw")
            .eq("id", prospect_id)
            .single()
            .execute()
        )
        raw = prospect_row.data.get("raw") if prospect_row.data else {}
        if not isinstance(raw, dict):
            raw = {}
        meta = {
            "id": snapshot_id,
            "token": token,
            "overall_score": overall,
            "generated_at": payload.get("generated_at") or now,
        }
        raw["snapshot"] = meta
        sb.table("outreach_prospects").update({"raw": raw, "updated_at": now}).eq("id", prospect_id).execute()

        return meta
    except Exception as exc:  # noqa: BLE001
        logger.warning("[audit_snapshot] persist failed for %s: %s", prospect_id, exc)
        return None


def generate_audit_snapshot(
    prospect: dict[str, Any],
    research: dict[str, Any],
    *,
    campaign_id: str = "pesttrace",
) -> dict[str, Any] | None:
    """Generate and persist audit snapshot. Non-blocking — returns None on failure."""
    if campaign_id != "pesttrace" or not outreach_snapshot_enabled():
        return None

    pid = prospect.get("id")
    if not pid:
        return None

    try:
        payload = build_snapshot_payload(prospect, research)
        meta = persist_snapshot(str(pid), campaign_id, payload)
        if meta and prospect.get("raw") is not None:
            raw = prospect.get("raw") or {}
            if isinstance(raw, dict):
                prospect["raw"] = {**raw, "snapshot": meta}
        elif meta:
            prospect["raw"] = {**(prospect.get("raw") or {}), "snapshot": meta}
        return meta
    except Exception as exc:  # noqa: BLE001
        logger.warning("[audit_snapshot] generate failed for %s: %s", pid, exc)
        return None


def prospect_has_snapshot(prospect: dict[str, Any]) -> bool:
    raw = prospect.get("raw") or {}
    if not isinstance(raw, dict):
        return False
    snap = raw.get("snapshot")
    return isinstance(snap, dict) and bool(snap.get("token"))


def snapshot_token(prospect: dict[str, Any]) -> str | None:
    raw = prospect.get("raw") or {}
    if not isinstance(raw, dict):
        return None
    snap = raw.get("snapshot")
    if isinstance(snap, dict) and snap.get("token"):
        return str(snap["token"])
    return None
