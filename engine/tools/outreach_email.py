"""Generate and send professional B2B outreach emails (campaign-aware).

Two campaigns are supported (see ``engine.tools.outreach_campaigns``):
  • ``pesttrace`` — sells compliance SaaS to UK/US/CA/AU pest control businesses
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
from tools.llm import generate_personalised_copy
from tools.outreach_campaigns import (
    CampaignConfig,
    DEFAULT_CAMPAIGN_ID,
    get_campaign,
    render_fallback_body,
)


# ── Generation ───────────────────────────────────────────────────────────────

def generate_outreach_email(
    prospect: dict[str, Any],
    campaign: CampaignConfig | str | None = None,
) -> bool:
    """Generate a draft email for a scraped prospect and store it in the DB.

    The campaign is resolved in this priority order:
      1. Explicit ``campaign`` argument (CampaignConfig or id)
      2. ``prospect["campaign"]`` column
      3. Default campaign (``pesttrace``) for legacy rows
    """
    pid = prospect.get("id")
    name = (prospect.get("name") or "").strip()
    country = (prospect.get("country") or "UK").upper()

    if not pid or not name:
        return False

    if isinstance(campaign, CampaignConfig):
        cfg = campaign
    else:
        cfg = get_campaign(
            campaign or str(prospect.get("campaign") or "").strip() or DEFAULT_CAMPAIGN_ID
        )

    website = (prospect.get("website_url") or cfg.website).strip()

    # Subject
    subject_prompt = cfg.subject_prompt.format(name=name, website=website, country=country)
    subject = generate_personalised_copy(
        business_context=f'{{"name": "{name}", "website": "{website}", "country": "{country}"}}',
        lead=f"Prospect: {name}",
        template=subject_prompt,
    ).strip().strip('"').strip("'")
    subject = subject.split("\n")[0].strip()[:80]
    if not subject or subject.startswith("[Draft"):
        subject = cfg.fallback_subject

    # Body
    body_prompt = cfg.body_prompt.format(name=name, website=website, country=country)
    body_text = generate_personalised_copy(
        business_context=f'{{"name": "{name}", "website": "{website}", "country": "{country}"}}',
        lead=f"Prospect: {name}",
        template=body_prompt,
    ).strip()
    if not body_text or body_text.startswith("[Draft"):
        body_text = render_fallback_body(cfg, name)

    html_body = _render_html(body_text, cfg)

    try:
        sb = get_supabase()
        sb.table("outreach_prospects").update(
            {
                "email_subject": subject,
                "email_body": html_body,
                "status": "draft_ready",
                "campaign": cfg.id,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        ).eq("id", pid).execute()
        return True
    except Exception as exc:  # noqa: BLE001
        print(f"[outreach_email] DB update failed for {name} ({cfg.id}): {exc}")
        return False


def _render_html(plain_text: str, cfg: CampaignConfig) -> str:
    """Wrap plain-text email body in minimal, professional HTML with the campaign's opt-out footer."""
    paragraphs = [p.strip() for p in plain_text.split("\n\n") if p.strip()]
    body_html = "\n".join(f"<p>{p.replace(chr(10), '<br>')}</p>" for p in paragraphs)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{cfg.label}</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;margin:32px auto;padding:0 16px;">
    <tr>
      <td>
        {body_html}
        <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0;">
        <p style="font-size:11px;color:#999999;margin:0;">
          {cfg.opt_out_footer}
        </p>
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

    Falls back to the shared SMTP_* / OUTREACH_* env vars when campaign-specific overrides
    are absent — this preserves the original PestTrace single-sender flow unchanged.
    """
    def _e(name: str) -> str:
        return os.getenv(name, "").strip().strip('"').strip("'")

    host = _e(cfg.smtp_host_env) or (smtp_host() or "")
    user = _e(cfg.smtp_user_env) or (smtp_user() or "")
    password = _e(cfg.smtp_password_env) or (smtp_password() or "")
    try:
        port = int(_e(cfg.smtp_port_env) or smtp_port())
    except ValueError:
        port = smtp_port()
    from_name = _e(cfg.default_from_name_env) or outreach_from_name() or cfg.sender_signature
    from_email = _e(cfg.default_from_email_env) or outreach_from_email() or user
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

