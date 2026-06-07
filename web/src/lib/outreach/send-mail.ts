import nodemailer from "nodemailer";
import {
  getEmailProvider,
  getResendConfig,
  getSmtpConfig,
} from "@/lib/outreach/campaign-env";

export type SendResult = { messageId?: string; provider: "smtp" | "resend" };

async function sendEmailViaSmtp(
  campaign: string,
  to: string,
  subject: string,
  html: string,
  plain: string,
  meta?: { prospectId?: string },
): Promise<SendResult> {
  const cfg = getSmtpConfig(campaign);
  if (!cfg.configured) throw new Error(`SMTP not configured for campaign '${campaign}'`);

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.password },
  });

  const replyTo = cfg.replyTo ?? `${cfg.fromName} <${cfg.fromEmail}>`;
  const headers: Record<string, string> = {};
  if (meta?.prospectId) {
    headers["X-IntentFlow-Prospect-Id"] = meta.prospectId;
    headers["X-Mailin-custom"] = JSON.stringify({ prospect_id: meta.prospectId, campaign });
  }

  const info = await transporter.sendMail({
    from: `${cfg.fromName} <${cfg.fromEmail}>`,
    replyTo,
    to,
    subject,
    text: plain,
    html,
    headers,
  });

  return { messageId: info.messageId, provider: "smtp" };
}

async function sendEmailViaResend(
  campaign: string,
  to: string,
  subject: string,
  html: string,
  plain: string,
  meta?: { prospectId?: string },
): Promise<SendResult> {
  const cfg = getResendConfig(campaign);
  if (!cfg.configured) throw new Error(`Resend not configured for campaign '${campaign}'`);

  const payload: Record<string, unknown> = {
    from: `${cfg.fromName} <${cfg.fromEmail}>`,
    to: [to],
    subject,
    html,
    text: plain,
    reply_to: cfg.replyTo ?? cfg.fromEmail,
  };
  if (meta?.prospectId) {
    payload.tags = [
      { name: "prospect_id", value: meta.prospectId },
      { name: "campaign", value: campaign },
    ];
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend error (${response.status}): ${body || "Unknown error"}`);
  }

  const data = (await response.json()) as { id?: string };
  return { messageId: data.id, provider: "resend" as const };
}

/** Send outreach email via configured provider (SMTP, Resend, or auto-fallback). */
export async function sendOutreachEmail(
  campaign: string,
  to: string,
  subject: string,
  html: string,
  plain: string,
  meta?: { prospectId?: string },
): Promise<SendResult> {
  const provider = getEmailProvider();
  const smtpConfigured = getSmtpConfig(campaign).configured;
  const resendConfigured = getResendConfig(campaign).configured;

  if (provider === "smtp") {
    return sendEmailViaSmtp(campaign, to, subject, html, plain, meta);
  }

  if (provider === "resend") {
    return sendEmailViaResend(campaign, to, subject, html, plain, meta);
  }

  if (resendConfigured) {
    try {
      return await sendEmailViaResend(campaign, to, subject, html, plain, meta);
    } catch (firstError) {
      if (!smtpConfigured) throw firstError;
    }
  }

  if (smtpConfigured) {
    return sendEmailViaSmtp(campaign, to, subject, html, plain, meta);
  }

  throw new Error(`No email provider configured for campaign '${campaign}'`);
}
