import nodemailer from "nodemailer";
import {
  getEmailProvider,
  getResendConfig,
  getSmtpConfig,
} from "@/lib/outreach/campaign-env";

async function sendEmailViaSmtp(
  campaign: string,
  to: string,
  subject: string,
  html: string,
  plain: string,
) {
  const cfg = getSmtpConfig(campaign);
  if (!cfg.configured) throw new Error(`SMTP not configured for campaign '${campaign}'`);

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.password },
  });

  const replyTo = cfg.replyTo ?? `${cfg.fromName} <${cfg.fromEmail}>`;
  await transporter.sendMail({
    from: `${cfg.fromName} <${cfg.fromEmail}>`,
    replyTo,
    to,
    subject,
    text: plain,
    html,
  });
}

async function sendEmailViaResend(
  campaign: string,
  to: string,
  subject: string,
  html: string,
  plain: string,
) {
  const cfg = getResendConfig(campaign);
  if (!cfg.configured) throw new Error(`Resend not configured for campaign '${campaign}'`);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      from: `${cfg.fromName} <${cfg.fromEmail}>`,
      to: [to],
      subject,
      html,
      text: plain,
      reply_to: cfg.replyTo ?? cfg.fromEmail,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend error (${response.status}): ${body || "Unknown error"}`);
  }
}

/** Send outreach email via configured provider (SMTP, Resend, or auto-fallback). */
export async function sendOutreachEmail(
  campaign: string,
  to: string,
  subject: string,
  html: string,
  plain: string,
) {
  const provider = getEmailProvider();
  const smtpConfigured = getSmtpConfig(campaign).configured;
  const resendConfigured = getResendConfig(campaign).configured;

  if (provider === "smtp") {
    await sendEmailViaSmtp(campaign, to, subject, html, plain);
    return;
  }

  if (provider === "resend") {
    await sendEmailViaResend(campaign, to, subject, html, plain);
    return;
  }

  if (resendConfigured) {
    try {
      await sendEmailViaResend(campaign, to, subject, html, plain);
      return;
    } catch (firstError) {
      if (!smtpConfigured) throw firstError;
    }
  }

  if (smtpConfigured) {
    await sendEmailViaSmtp(campaign, to, subject, html, plain);
    return;
  }

  throw new Error(`No email provider configured for campaign '${campaign}'`);
}
