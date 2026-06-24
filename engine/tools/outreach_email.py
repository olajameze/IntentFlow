"""Generate and send professional B2B outreach emails (campaign-aware).

Two campaigns are supported (see ``engine.tools.outreach_campaigns``):
  • ``pesttrace`` — sells compliance SaaS to pest control businesses (EU, India, UK, Americas)
  • ``weathers`` — sells pest control services to UK West Midlands commercial premises

Flow:
  generate_outreach_email(prospect, campaign)
    → Groq/Ollama LLM generates subject + plain HTML body using campaign prompts
    → Updates outreach_prospects row: email_subject, email_body, status = draft_ready

  send_outreach_email(prospect)
    → Picks SMTP credentials based on the prospect's ``campaign`` column
    → Sends via SMTP (TLS, port 587)
    → Updates row: status = sent, sent_at = now()
"""

from __future__ import annotations

import os
import re
import smtplib
import sys
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Any

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from config import (
    outreach_from_email,
    outreach_from_name,
    smtp_host,
    smtp_password,
    smtp_port,
    smtp_user,
)
from supabase_client import get_supabase
from html import escape as html_escape

from tools.copy_doctrine import BREAZY_MARKETING_FOCUS, JGDEVS_MARKETING_FOCUS, OUTREACH_CONVERSION_DOCTRINE
from tools.audit_snapshot import SNAPSHOT_URL_PLACEHOLDER, prospect_has_snapshot
from tools.email_validator import normalize_outreach_body, validate_outreach_copy
from tools.outreach_locale import locale_rules_for_country, normalize_outreach_country
from tools.llm import generate_outreach_copy
from tools.outreach_campaign_db import get_campaign
from tools.outreach_campaigns import (
    CampaignConfig,
    DEFAULT_CAMPAIGN_ID,
    JGDEVS_SNAPSHOT_BODY_PROMPT,
    JGDEVS_SNAPSHOT_FALLBACK_BODY,
    JGDEVS_SNAPSHOT_FALLBACK_SUBJECT_A,
    JGDEVS_SNAPSHOT_FALLBACK_SUBJECT_B,
    JGDEVS_SNAPSHOT_SUBJECT_PROMPT,
    PESTTRACE_SNAPSHOT_BODY_PROMPT,
    PESTTRACE_SNAPSHOT_FALLBACK_BODY,
    PESTTRACE_SNAPSHOT_FALLBACK_SUBJECT_A,
    PESTTRACE_SNAPSHOT_FALLBACK_SUBJECT_B,
    PESTTRACE_SNAPSHOT_SUBJECT_PROMPT,
    WEATHERS_SNAPSHOT_BODY_PROMPT,
    WEATHERS_SNAPSHOT_FALLBACK_BODY,
    WEATHERS_SNAPSHOT_FALLBACK_SUBJECT_A,
    WEATHERS_SNAPSHOT_FALLBACK_SUBJECT_B,
    WEATHERS_SNAPSHOT_SUBJECT_PROMPT,
    render_fallback_body,
    sector_angle,
)

_SNAPSHOT_CAMPAIGNS = frozenset({"pesttrace", "weathers", "jgdevs"})

_SNAPSHOT_SECONDARY_LABEL: dict[str, str] = {
    "pesttrace": "Start 7-day free trial",
    "weathers": "Book a pest control visit",
    "jgdevs": "See how we can help",
}


def _snapshot_email_prompts(campaign_id: str, name: str) -> tuple[str, str, str, str, str]:
    """Return subject_prompt, body_prompt, fallback_body, fallback_subject_a, fallback_subject_b."""
    if campaign_id == "weathers":
        return (
            WEATHERS_SNAPSHOT_SUBJECT_PROMPT,
            WEATHERS_SNAPSHOT_BODY_PROMPT,
            WEATHERS_SNAPSHOT_FALLBACK_BODY,
            WEATHERS_SNAPSHOT_FALLBACK_SUBJECT_A,
            WEATHERS_SNAPSHOT_FALLBACK_SUBJECT_B,
        )
    if campaign_id == "jgdevs":
        return (
            JGDEVS_SNAPSHOT_SUBJECT_PROMPT,
            JGDEVS_SNAPSHOT_BODY_PROMPT,
            JGDEVS_SNAPSHOT_FALLBACK_BODY,
            JGDEVS_SNAPSHOT_FALLBACK_SUBJECT_A,
            JGDEVS_SNAPSHOT_FALLBACK_SUBJECT_B,
        )
    return (
        PESTTRACE_SNAPSHOT_SUBJECT_PROMPT,
        PESTTRACE_SNAPSHOT_BODY_PROMPT,
        PESTTRACE_SNAPSHOT_FALLBACK_BODY,
        PESTTRACE_SNAPSHOT_FALLBACK_SUBJECT_A,
        PESTTRACE_SNAPSHOT_FALLBACK_SUBJECT_B,
    )


# ── Generation ───────────────────────────────────────────────────────────────

# Lines starting with these phrases are LLM meta-commentary, NOT subject lines.
# Small fallback models (Llama 3.2 1b) often ignore the "no preamble" instruction.
_META_PREFIXES = (
    "here are", "here is", "based on", "i'll ", "i will ", "let me ",
    "sure,", "sure!", "sure.", "okay,", "got it", "understood",
    "target audience:", "strategy:", "approach:", "context:", "rationale:",
    "explanation:", "note:", "tone:", "style:", "format:", "example:",
    "for variant", "line 1", "line 2", "line 1 ", "line 2 ",
    "below are", "following are", "as requested", "as instructed",
    # Refusal patterns — over-cautious small models sometimes refuse the task.
    "i don't", "i do not", "i can't", "i cannot", "i won't", "i will not",
    "i'm sorry", "i'm not able", "i am not able", "i apologize", "i refuse",
    "unfortunately,", "regrettably,", "sorry,", "sorry ",
)

# Words that, if found anywhere in a candidate line, mean it's almost certainly
# meta-commentary about the task rather than an actual subject line.
_META_KEYWORDS = (
    "subject lin", "two variants", "guidelines", "b2b email", "cold email",
    "industry", "the recipient", "the prospect", "audit-readiness problem",
    "(question style)", "(statement style)", "(value style)",
    # Refusal vocabulary that wasn't caught by prefix matching
    "deceive", "perceived as spam", "marketing strategies", "harmful",
)


def _looks_like_subject(line: str) -> bool:
    """Return True if a line plausibly is a clean email subject (not meta-commentary)."""
    low = line.lower()
    if any(low.startswith(p) for p in _META_PREFIXES):
        return False
    if any(k in low for k in _META_KEYWORDS):
        return False
    # Reject lines that look like JSON (LLM occasionally echoes the input context)
    if line.startswith("{") or line.startswith("["):
        return False
    if '"name":' in line or '"website":' in line or '"country":' in line:
        return False
    # Subject prompts cap at 60 chars; allow a little slack for trailing punctuation.
    # Anything ≥75 chars is almost certainly verbose meta-commentary.
    if len(line) >= 75:
        return False
    # A trailing colon with no other content usually means a label-only line ("Subject A:")
    if line.rstrip().endswith(":") and len(line) < 20:
        return False
    # Reject lines containing URLs — they're usually part of an echoed context blob
    if "http://" in low or "https://" in low or "www." in low:
        return False
    return True


def _parse_subject_variants(raw: str, fallback: str) -> tuple[str, str]:
    """Split LLM output into two subject variants for A/B testing (Klaviyo step 8).

    Robust against chatty LLMs (Llama 3.2 1b often emits preamble like
    "Target Audience: ..." / "Here are two subject lines:" / "Line 1 — variant A:"
    despite the prompt explicitly forbidding it). Strategy:

      1. Walk every line, strip whitespace + outer quotes
      2. Strip common prefixes the LLM still emits ("Subject A:", "1.", "Variant B —")
      3. Reject lines that look like meta-commentary (see ``_looks_like_subject``)
      4. Cap each accepted line at 80 chars
      5. Return the first two survivors; pad with ``fallback`` if fewer than two
    """
    cleaned: list[str] = []
    for line in (raw or "").splitlines():
        s = line.strip()
        if not s or s.startswith("[Draft"):
            continue
        # Strip markdown bullets / dashes / numbering the LLM may add
        s = re.sub(r"^\s*[-*•]\s+", "", s)
        s = re.sub(r"^\d+[\.\)]\s*", "", s)
        # Strip "Line N — variant X:" / "Variant A:" / "Subject A:" / "A:" style prefixes
        s = re.sub(r"^line\s*\d+\s*[—\-:]?\s*(variant\s*[ab]\s*[:\-]?)?\s*", "", s, flags=re.IGNORECASE)
        s = re.sub(r"^(variant|subject|option)\s*[ab]\s*[:\-]\s*", "", s, flags=re.IGNORECASE)
        s = re.sub(r"^[ab]\s*[:\-]\s*", "", s, flags=re.IGNORECASE)
        # Strip wrapping quotes / asterisks (markdown bold)
        s = s.strip(' "\'`*_').strip()
        if not s:
            continue
        if not _looks_like_subject(s):
            continue
        # Strip trailing terminal punctuation that's awkward in inboxes
        s = s.rstrip(' .')
        if s:
            cleaned.append(s[:80])
        if len(cleaned) == 2:
            break
    if not cleaned:
        return fallback, fallback
    if len(cleaned) == 1:
        return cleaned[0], fallback
    return cleaned[0], cleaned[1]


def _research_prompt_vars(prospect: dict[str, Any], angle: str) -> dict[str, str]:
    """Build template variables from prospect research (raw.research) with fallbacks."""
    raw = prospect.get("raw") or {}
    research = raw.get("research") if isinstance(raw, dict) else {}
    if not isinstance(research, dict):
        research = {}

    services_list = research.get("services") or []
    if isinstance(services_list, list) and services_list:
        services = ", ".join(str(s) for s in services_list[:4])
    else:
        services = angle

    location = str(research.get("location") or prospect.get("city") or prospect.get("country") or "")
    industry = str(research.get("industry") or prospect.get("sector") or "commercial")

    weaknesses = research.get("weaknesses") or []
    weakness = (
        str(weaknesses[0])
        if isinstance(weaknesses, list) and weaknesses
        else "operational documentation gaps"
    )

    opportunities = research.get("opportunities") or []
    opportunity = (
        str(opportunities[0])
        if isinstance(opportunities, list) and opportunities
        else angle
    )

    return {
        "services": services,
        "location": location,
        "industry": industry.replace("_", " "),
        "weakness": weakness,
        "opportunity": opportunity,
    }


def _generate_validated_copy(
    *,
    business_context: str,
    lead: str,
    template: str,
    outreach_doctrine: str,
    fallback: str,
    kind: str,
    max_attempts: int = 3,
) -> str:
    """Generate outreach copy with validation and auto-regeneration."""
    for attempt in range(1, max_attempts + 1):
        strict = attempt > 1
        raw = generate_outreach_copy(
            business_context=business_context,
            lead=lead,
            template=template,
            extra_doctrine=outreach_doctrine,
            strict=strict,
        ).strip()
        body = normalize_outreach_body(raw)
        ok_body, body_issues = validate_outreach_copy("Subject line", body, kind)  # type: ignore[arg-type]
        if ok_body and body and not body.startswith("[Draft"):
            return body
        print(f"[outreach_email] Body validation failed (attempt {attempt}): {body_issues}")

    return fallback


def _generate_validated_subjects(
    *,
    business_context: str,
    lead: str,
    subject_prompt: str,
    outreach_doctrine: str,
    fallback: str,
    max_attempts: int = 3,
) -> tuple[str, str]:
    for attempt in range(1, max_attempts + 1):
        strict = attempt > 1
        subject_raw = generate_outreach_copy(
            business_context=business_context,
            lead=lead,
            template=subject_prompt,
            extra_doctrine=outreach_doctrine,
            strict=strict,
        )
        subject_a, subject_b = _parse_subject_variants(subject_raw, fallback)
        ok_a, issues_a = validate_outreach_copy(
            subject_a, "Professional note regarding your operations.", "initial"
        )
        if ok_a and _looks_like_subject(subject_a) and subject_a != fallback:
            return subject_a, subject_b
        print(f"[outreach_email] Subject issues (attempt {attempt}): {issues_a}")
        print(f"[outreach_email] Subject validation failed (attempt {attempt})")

    return fallback, fallback


def generate_outreach_email(
    prospect: dict[str, Any],
    campaign: CampaignConfig | str | None = None,
) -> bool:
    """Generate a draft email (subject A/B + sector-aware body + CTA HTML) and store it in the DB.

    The campaign is resolved in this priority order:
      1. Explicit ``campaign`` argument (CampaignConfig or id)
      2. ``prospect["campaign"]`` column
      3. Default campaign (``pesttrace``) for legacy rows
    """
    pid = prospect.get("id")
    name = (prospect.get("name") or "").strip()
    country = normalize_outreach_country(prospect.get("country"))

    if not pid or not name:
        return False

    if isinstance(campaign, CampaignConfig):
        cfg = campaign
    else:
        cfg = get_campaign(
            campaign or str(prospect.get("campaign") or "").strip() or DEFAULT_CAMPAIGN_ID
        )

    outreach_doctrine = f"{OUTREACH_CONVERSION_DOCTRINE}\n\n{locale_rules_for_country(country)}"
    if cfg.id == "jgdevs":
        outreach_doctrine = f"{outreach_doctrine}\n\n{JGDEVS_MARKETING_FOCUS}"
    elif cfg.id == "breazy":
        outreach_doctrine = f"{outreach_doctrine}\n\n{BREAZY_MARKETING_FOCUS}"

    website = (prospect.get("website_url") or cfg.website).strip()
    sector = str(prospect.get("sector") or "generic").strip().lower() or "generic"
    angle = sector_angle(cfg, sector)
    research_vars = _research_prompt_vars(prospect, angle)
    fmt = {
        "name": name,
        "website": website,
        "country": country,
        "sector_angle": angle,
        **research_vars,
    }
    business_context = (
        f'{{"name": "{name}", "website": "{website}", "country": "{country}", '
        f'"sector": "{sector}", "services": "{research_vars["services"]}", '
        f'"location": "{research_vars["location"]}", "industry": "{research_vars["industry"]}"}}'
    )
    lead = f"Prospect: {name}"
    use_snapshot = cfg.id in _SNAPSHOT_CAMPAIGNS and prospect_has_snapshot(prospect)

    # ── Subject (A + B for Klaviyo-style A/B testing) ───────────────────────
    if use_snapshot:
        subject_prompt, _, _, fallback_a_tpl, fallback_b_tpl = _snapshot_email_prompts(cfg.id, name)
        subject_prompt = subject_prompt.format(**fmt)
        fallback_a = fallback_a_tpl.format(name=name)[:60]
        fallback_b = fallback_b_tpl.format(name=name)[:60]
        subject_a, subject_b = _generate_validated_subjects(
            business_context=business_context,
            lead=lead,
            subject_prompt=subject_prompt,
            outreach_doctrine=outreach_doctrine,
            fallback=fallback_a,
        )
        if subject_a == fallback_a and subject_b == fallback_a:
            subject_b = fallback_b
    else:
        subject_prompt = cfg.subject_prompt.format(**fmt)
        subject_a, subject_b = _generate_validated_subjects(
            business_context=business_context,
            lead=lead,
            subject_prompt=subject_prompt,
            outreach_doctrine=outreach_doctrine,
            fallback=cfg.fallback_subject,
        )

    # ── Body ─────────────────────────────────────────────────────────────────
    if use_snapshot:
        _, body_prompt, fallback_body_tpl, _, _ = _snapshot_email_prompts(cfg.id, name)
        body_prompt = body_prompt.format(**fmt)
        fallback_body = fallback_body_tpl.format(name=name)
    else:
        body_prompt = cfg.body_prompt.format(**fmt)
        fallback_body = render_fallback_body(cfg, name)
    body_text = _generate_validated_copy(
        business_context=business_context,
        lead=lead,
        template=body_prompt,
        outreach_doctrine=outreach_doctrine,
        fallback=fallback_body,
        kind="initial",
    )
    if not body_text or body_text.startswith("[Draft"):
        body_text = fallback_body

    # NOTE: the CTA URL and tracking pixel are injected at *send time* by the
    # Next.js send route, because they need the absolute base URL of the app
    # (so the tracking redirector points to /api/outreach-track/click etc).
    # We render a placeholder CTA + pixel here so the email looks complete in
    # the dashboard preview. The send route swaps the placeholders for real
    # tracking URLs before delivery.
    html_body = _render_html(
        body_text,
        cfg,
        prospect_id=str(pid),
        snapshot_primary=use_snapshot,
        snapshot_secondary_label=_SNAPSHOT_SECONDARY_LABEL.get(cfg.id, cfg.cta_label),
    )

    from tools.ab_winner import apply_ab_winner_subjects, load_ab_winner

    primary_subject, challenger_subject = apply_ab_winner_subjects(
        subject_a, subject_b, load_ab_winner(cfg.id)
    )

    try:
        sb = get_supabase()
        sb.table("outreach_prospects").update(
            {
                "email_subject": primary_subject,
                "email_subject_b": challenger_subject,
                "email_body": html_body,
                "status": "draft_ready",
                "campaign": cfg.id,
                "sector": sector,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        ).eq("id", pid).execute()
        return True
    except Exception as exc:  # noqa: BLE001
        print(f"[outreach_email] DB update failed for {name} ({cfg.id}): {exc}")
        return False


def _render_html(
    plain_text: str,
    cfg: CampaignConfig,
    prospect_id: str = "",
    *,
    snapshot_primary: bool = False,
    snapshot_secondary_label: str = "Learn more",
) -> str:
    """Render the campaign's branded conversion-focused HTML email.

    Klaviyo steps 6 + 7: tailor to journey stage with ONE clear CTA button, trust badges
    above the fold, mobile-first layout.

    The default CTA href is the UTM-tagged campaign URL (works fine if the email is sent
    without tracking). The send route in Next.js detects ``data-outreach-cta="true"`` on
    the anchor and ``<!-- OUTREACH_TRACKING_PIXEL -->`` in the markup and swaps them for
    a click-tracked redirector + a 1×1 open-tracking pixel at delivery time.

    When ``snapshot_primary`` is True, the primary CTA points to ``__SNAPSHOT_URL__``
    (replaced at send time) and a secondary trial CTA uses the campaign URL template.
    """
    paragraphs = [p.strip() for p in plain_text.split("\n\n") if p.strip()]
    body_html = "\n".join(
        f'<p data-outreach-body="true" style="margin:0 0 16px 0;font-size:15px;line-height:1.55;color:#1a1a1a;">'
        f"{html_escape(p).replace(chr(10), '<br>')}</p>"
        for p in paragraphs
    )

    badges_html = " &nbsp;·&nbsp; ".join(
        f'<span style="color:#4a5568;">{b}</span>' for b in cfg.trust_badges
    )

    trial_url = cfg.cta_url_template.format(prospect_id=prospect_id or "preview")

    if snapshot_primary:
        primary_label = "View your snapshot"
        primary_href = SNAPSHOT_URL_PLACEHOLDER
        secondary_cta = f"""
          <tr>
            <td align="center" style="padding:0 24px 16px 24px;">
              <a data-outreach-cta="true" href="{trial_url}" style="display:inline-block;background:#ffffff;color:{cfg.accent_color};text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px;border:2px solid {cfg.accent_color};">
                {html_escape(snapshot_secondary_label)}
              </a>
            </td>
          </tr>"""
    else:
        primary_label = cfg.cta_label
        primary_href = trial_url
        secondary_cta = ""

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{cfg.label}</title>
</head>
<body style="margin:0;padding:0;background:#f7f7f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,Helvetica,sans-serif;color:#1a1a1a;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f7f7f5;padding:24px 0;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;background:#ffffff;border-radius:12px;border:1px solid #e5e5e5;overflow:hidden;">
          <tr>
            <td style="background:{cfg.accent_color};padding:14px 24px;color:#ffffff;font-weight:600;font-size:14px;letter-spacing:0.3px;">
              {cfg.sender_signature}
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 8px 28px;">
              {body_html}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:12px 24px 24px 24px;">
              <a data-outreach-cta="true" href="{primary_href}" style="display:inline-block;background:{cfg.accent_color};color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:15px;">
                {primary_label}
              </a>
            </td>
          </tr>
          {secondary_cta}
          <tr>
            <td align="center" style="padding:0 24px 24px 24px;font-size:12px;color:#4a5568;">
              {badges_html}
            </td>
          </tr>
          <tr>
            <td style="background:#fafafa;border-top:1px solid #eeeeee;padding:16px 24px;font-size:11px;line-height:1.5;color:#888888;">
              {cfg.opt_out_footer}
            </td>
          </tr>
        </table>
        <!-- OUTREACH_TRACKING_PIXEL -->
      </td>
    </tr>
  </table>
</body>
</html>"""


# ── Sending ──────────────────────────────────────────────────────────────────

class SmtpNotConfiguredError(RuntimeError):
    pass


def _campaign_smtp(cfg: CampaignConfig) -> dict[str, Any]:
    """Resolve SMTP host/port/user/password + from-name/from-email for a campaign.

    Campaign-specific env vars are used exclusively for non-pesttrace campaigns.
    PestTrace may fall back to shared SMTP_* / OUTREACH_* env vars.
    """
    def _e(name: str) -> str:
        return os.getenv(name, "").strip().strip('"').strip("'")

    is_pesttrace = cfg.id == "pesttrace"
    host = _e(cfg.smtp_host_env) or (smtp_host() if is_pesttrace else "")
    user = _e(cfg.smtp_user_env) or (smtp_user() if is_pesttrace else "")
    password = _e(cfg.smtp_password_env) or (smtp_password() if is_pesttrace else "")
    try:
        port = int(_e(cfg.smtp_port_env) or smtp_port())
    except ValueError:
        port = smtp_port()
    if is_pesttrace:
        from_name = _e(cfg.default_from_name_env) or outreach_from_name() or cfg.sender_signature
        from_email = _e(cfg.default_from_email_env) or outreach_from_email() or user
    else:
        from_name = _e(cfg.default_from_name_env) or cfg.sender_signature
        from_email = _e(cfg.default_from_email_env) or user
    return {
        "host": host,
        "port": port,
        "user": user,
        "password": password,
        "from_name": from_name,
        "from_email": from_email,
    }


def send_outreach_email(
    prospect: dict[str, Any],
    campaign: CampaignConfig | str | None = None,
) -> bool:
    """Send the approved email draft to the prospect via the campaign's SMTP credentials.

    Raises ``SmtpNotConfiguredError`` if the campaign has no resolvable SMTP credentials.
    """
    pid = prospect.get("id")
    to_email = (prospect.get("email") or "").strip()
    subject = (prospect.get("email_subject") or "").strip()
    html_body = (prospect.get("email_body") or "").strip()
    name = (prospect.get("name") or "").strip()

    if not to_email or not subject or not html_body:
        print(f"[outreach_email] Missing fields for {name} — skipping send")
        return False

    if isinstance(campaign, CampaignConfig):
        cfg = campaign
    else:
        cfg = get_campaign(
            campaign or str(prospect.get("campaign") or "").strip() or DEFAULT_CAMPAIGN_ID
        )

    smtp = _campaign_smtp(cfg)
    if not (smtp["host"] and smtp["user"] and smtp["password"]):
        raise SmtpNotConfiguredError(
            f"SMTP is not configured for campaign '{cfg.id}'. Set "
            f"{cfg.smtp_host_env}, {cfg.smtp_user_env}, {cfg.smtp_password_env} — "
            f"or the shared SMTP_HOST/SMTP_USER/SMTP_PASSWORD as a fallback."
        )

    from_addr = smtp["from_email"] or smtp["user"]
    from_name = smtp["from_name"]

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{from_name} <{from_addr}>"
    msg["To"] = to_email
    msg["Reply-To"] = from_addr

    plain = re.sub(r"<[^>]+>", "", html_body).strip() if html_body else subject

    msg.attach(MIMEText(plain, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    try:
        with smtplib.SMTP(smtp["host"], smtp["port"], timeout=20) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(smtp["user"], smtp["password"])
            server.sendmail(from_addr, [to_email], msg.as_string())

        # Mark sent
        sb = get_supabase()
        sb.table("outreach_prospects").update(
            {
                "status": "sent",
                "sent_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        ).eq("id", pid).execute()

        print(f"[outreach_email] Sent → {to_email} ({name}) via {cfg.id}")
        return True

    except smtplib.SMTPRecipientsRefused:
        _mark_bounced(pid)
        print(f"[outreach_email] Bounced: {to_email}")
        return False
    except Exception as exc:  # noqa: BLE001
        print(f"[outreach_email] SMTP error for {to_email}: {exc}")
        return False


def _mark_bounced(prospect_id: str) -> None:
    try:
        sb = get_supabase()
        sb.table("outreach_prospects").update(
            {"status": "bounced", "updated_at": datetime.now(timezone.utc).isoformat()}
        ).eq("id", prospect_id).execute()
    except Exception:  # noqa: BLE001
        pass

