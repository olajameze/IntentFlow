"""Generate and send professional B2B outreach emails for PestTrace.

Email angle: compliance and operational risk inside pest control businesses.
PestTrace is positioned as the digital audit/field-documentation solution — not sold
as a product, introduced as the answer to a compliance problem the reader already has.

Flow:
  generate_outreach_email(prospect)
    → Groq/Ollama LLM generates subject + plain HTML body
    → Updates outreach_prospects row: email_subject, email_body, status = draft_ready

  send_outreach_email(prospect)
    → Sends via SMTP (TLS, port 587)
    → Updates row: status = sent, sent_at = now()
"""

from __future__ import annotations

import re
import smtplib
import sys
import textwrap
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
    smtp_configured,
    smtp_host,
    smtp_password,
    smtp_port,
    smtp_user,
)
from supabase_client import get_supabase
from tools.llm import generate_personalised_copy


# ── Prompts ─────────────────────────────────────────────────────────────────

_SUBJECT_PROMPT = """You are writing a cold B2B email subject line for PestTrace.com.

PestTrace is a compliance and field-documentation SaaS for pest control operators.

The recipient is a pest control business owner or manager at: {name} ({website})

Write ONE concise subject line (max 60 characters). Rules:
- Focus on a compliance or audit-readiness problem they may have.
- Do NOT mention PestTrace in the subject — the subject should feel like a relevant industry question.
- No clickbait. No exclamation marks. No emojis.
- UK English.

Examples of good subject lines:
  "Are your pest control records audit-ready?"
  "Field documentation gaps are a growing compliance risk"
  "One CQC audit question most operators aren't ready for"

Return ONLY the subject line — no quotes, no explanation."""


_BODY_PROMPT = """You are writing a cold B2B email on behalf of PestTrace.com.

PestTrace is a compliance and field-documentation SaaS built for pest control operators.
It helps businesses digitise job records, stay audit-ready, and reduce admin time.

Recipient business: {name}
Website: {website}
Country: {country}

Write a professional B2B outreach email. Rules:
- Tone: calm authority. Never needy, never begging. Read like advice from a peer, not a sales pitch.
- Structure: short opener (1 sentence) → compliance/operational problem (2–3 sentences) → how PestTrace solves it (2–3 sentences) → soft CTA (visit pesttrace.com or reply)
- Do NOT mention pricing, discounts, or urgency pressure.
- Do NOT use phrases like "I hope this email finds you well", "just reaching out", or "I wanted to touch base".
- Max 180 words total body text.
- UK English unless the business is in the US, Canada, or Australia.
- End with a professional sign-off: "Best regards, [Your Name]\nPestTrace Team\nhttps://pesttrace.com"
- Replace [Your Name] with just "The PestTrace Team" — do not invent a person's name.

Return ONLY the email body text — no subject line, no meta-commentary."""


# ── Generation ───────────────────────────────────────────────────────────────

def generate_outreach_email(prospect: dict[str, Any]) -> bool:
    """Generate a draft email for a scraped prospect and store it in the DB.

    Returns True if draft was generated and saved successfully.
    """
    pid = prospect.get("id")
    name = (prospect.get("name") or "").strip()
    website = (prospect.get("website_url") or "pesttrace.com").strip()
    country = (prospect.get("country") or "UK").upper()

    if not pid or not name:
        return False

    # Generate subject line
    subject_prompt = _SUBJECT_PROMPT.format(name=name, website=website)
    subject = generate_personalised_copy(
        business_context=f'{{"name": "{name}", "website": "{website}", "country": "{country}"}}',
        lead=f"Pest control business: {name}",
        template=subject_prompt,
    ).strip().strip('"').strip("'")

    # Truncate if LLM returned more than one line
    subject = subject.split("\n")[0].strip()[:80]

    if not subject or subject.startswith("[Draft"):
        subject = "Are your pest control records audit-ready?"

    # Generate body
    body_prompt = _BODY_PROMPT.format(name=name, website=website, country=country)
    body_text = generate_personalised_copy(
        business_context=f'{{"name": "{name}", "website": "{website}", "country": "{country}"}}',
        lead=f"Pest control business: {name}",
        template=body_prompt,
    ).strip()

    if not body_text or body_text.startswith("[Draft"):
        body_text = _fallback_body(name, website)

    # Render as simple HTML
    html_body = _render_html(body_text, name)

    # Persist to DB
    try:
        sb = get_supabase()
        sb.table("outreach_prospects").update(
            {
                "email_subject": subject,
                "email_body": html_body,
                "status": "draft_ready",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        ).eq("id", pid).execute()
        return True
    except Exception as exc:  # noqa: BLE001
        print(f"[outreach_email] DB update failed for {name}: {exc}")
        return False


def _fallback_body(name: str, website: str) -> str:
    return textwrap.dedent(f"""
        Pest control businesses face increasing pressure to maintain accurate, timestamped records for every job — from pesticide applications to re-inspection schedules.

        Manual paperwork and spreadsheets leave gaps that regulators and auditors increasingly flag.

        PestTrace digitises field documentation for operators like {name}, making audit trails automatic and inspection reports instant.

        If keeping records compliant is on your agenda, it's worth a look at pesttrace.com.

        Best regards,
        The PestTrace Team
        https://pesttrace.com
    """).strip()


def _render_html(plain_text: str, recipient_name: str) -> str:
    """Wrap plain-text email body in minimal, professional HTML."""
    # Convert double newlines to paragraph breaks
    paragraphs = [p.strip() for p in plain_text.split("\n\n") if p.strip()]
    body_html = "\n".join(f"<p>{p.replace(chr(10), '<br>')}</p>" for p in paragraphs)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PestTrace</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;margin:32px auto;padding:0 16px;">
    <tr>
      <td>
        {body_html}
        <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0;">
        <p style="font-size:11px;color:#999999;margin:0;">
          You received this email because your pest control business was found in a public directory.
          To opt out, reply with <strong>STOP</strong> and we will never contact you again.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>"""


# ── Sending ──────────────────────────────────────────────────────────────────

class SmtpNotConfiguredError(RuntimeError):
    pass


def send_outreach_email(prospect: dict[str, Any]) -> bool:
    """Send the approved email draft to the prospect via SMTP.

    Returns True on success. Raises SmtpNotConfiguredError if SMTP is not set up.
    """
    if not smtp_configured():
        raise SmtpNotConfiguredError(
            "SMTP is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASSWORD in your environment."
        )

    pid = prospect.get("id")
    to_email = (prospect.get("email") or "").strip()
    subject = (prospect.get("email_subject") or "").strip()
    html_body = (prospect.get("email_body") or "").strip()
    name = (prospect.get("name") or "").strip()

    if not to_email or not subject or not html_body:
        print(f"[outreach_email] Missing fields for {name} — skipping send")
        return False

    from_addr = outreach_from_email() or smtp_user() or ""
    from_name = outreach_from_name()

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{from_name} <{from_addr}>"
    msg["To"] = to_email
    msg["Reply-To"] = from_addr

    # Plain-text fallback stripped from HTML
    plain = re.sub(r"<[^>]+>", "", html_body).strip() if html_body else subject

    msg.attach(MIMEText(plain, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    host = smtp_host() or ""
    port = smtp_port()
    user = smtp_user() or ""
    password = smtp_password() or ""

    try:
        with smtplib.SMTP(host, port, timeout=20) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(user, password)
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

        print(f"[outreach_email] Sent → {to_email} ({name})")
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

