import { NextResponse } from "next/server";
import { withSupabaseRoute } from "@/lib/with-supabase-route";
import nodemailer from "nodemailer";

type EmailProvider = "smtp" | "resend" | "auto";

function getEmailProvider(): EmailProvider {
  const raw = process.env.OUTREACH_EMAIL_PROVIDER?.trim().toLowerCase();
  if (raw === "smtp" || raw === "resend" || raw === "auto") return raw;
  return "auto";
}

function getBaseConfig() {
  const fromName = process.env.OUTREACH_FROM_NAME?.trim() || "PestTrace Team";
  const fromEmail = process.env.OUTREACH_FROM_EMAIL?.trim() || process.env.SMTP_USER?.trim();
  return { fromName, fromEmail };
}

function getSmtpConfig() {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASSWORD?.trim();
  const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
  const { fromName, fromEmail } = getBaseConfig();
  return { host, user, password, port, fromName, fromEmail, configured: !!(host && user && password) };
}

function getResendConfig() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const { fromName, fromEmail } = getBaseConfig();
  return { apiKey, fromName, fromEmail, configured: !!(apiKey && fromEmail) };
}

function getDailyLimit(): number {
  const raw = process.env.OUTREACH_DAILY_SEND_LIMIT;
  const n = parseInt(raw ?? "20", 10);
  return Number.isFinite(n) && n > 0 ? n : 20;
}

async function sendEmailViaSmtp(
  to: string,
  subject: string,
  html: string,
  plain: string,
) {
  const cfg = getSmtpConfig();
  if (!cfg.configured) throw new Error("SMTP not configured");

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.password },
  });

  await transporter.sendMail({
    from: `${cfg.fromName} <${cfg.fromEmail}>`,
    replyTo: `${cfg.fromName} <${cfg.fromEmail}>`,
    to,
    subject,
    text: plain,
    html,
  });
}

async function sendEmailViaResend(
  to: string,
  subject: string,
  html: string,
  plain: string,
) {
  const cfg = getResendConfig();
  if (!cfg.configured) throw new Error("Resend not configured");

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
      reply_to: cfg.fromEmail,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend error (${response.status}): ${body || "Unknown error"}`);
  }
}

async function sendEmail(
  to: string,
  subject: string,
  html: string,
  plain: string,
) {
  const provider = getEmailProvider();
  const smtpConfigured = getSmtpConfig().configured;
  const resendConfigured = getResendConfig().configured;

  if (provider === "smtp") {
    await sendEmailViaSmtp(to, subject, html, plain);
    return;
  }

  if (provider === "resend") {
    await sendEmailViaResend(to, subject, html, plain);
    return;
  }

  // auto: prefer Resend when configured, then fallback to SMTP
  if (resendConfigured) {
    try {
      await sendEmailViaResend(to, subject, html, plain);
      return;
    } catch (firstError) {
      if (!smtpConfigured) throw firstError;
    }
  }

  if (smtpConfigured) {
    await sendEmailViaSmtp(to, subject, html, plain);
    return;
  }

  throw new Error("No email provider configured");
}

function htmlToPlain(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim();
}

/** POST { id } — send a single approved prospect's email */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const bulk = body.bulk === true;

  const provider = getEmailProvider();
  const smtpConfigured = getSmtpConfig().configured;
  const resendConfigured = getResendConfig().configured;
  const configuredForRequestedProvider = provider === "smtp"
    ? smtpConfigured
    : provider === "resend"
      ? resendConfigured
      : (smtpConfigured || resendConfigured);

  if (!configuredForRequestedProvider) {
    return NextResponse.json(
      {
        error: "Email sender is not configured.",
        hint: "Set OUTREACH_EMAIL_PROVIDER=smtp|resend|auto. For SMTP: SMTP_HOST, SMTP_USER, SMTP_PASSWORD (and SMTP_PORT). For Resend: RESEND_API_KEY and OUTREACH_FROM_EMAIL.",
      },
      { status: 400 },
    );
  }

  return withSupabaseRoute(async (sb) => {
    // ── Single send ──
    if (!bulk) {
      const id = typeof body.id === "string" ? body.id : null;
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

      const { data: prospect, error } = await sb
        .from("outreach_prospects")
        .select("*")
        .eq("id", id)
        .single();

      if (error || !prospect) return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
      if (prospect.status !== "approved") {
        return NextResponse.json({ error: "Prospect must be approved before sending." }, { status: 400 });
      }
      if (!prospect.email || !prospect.email_subject || !prospect.email_body) {
        return NextResponse.json({ error: "Missing email address, subject, or body." }, { status: 400 });
      }

      try {
        await sendEmail(
          prospect.email,
          prospect.email_subject,
          prospect.email_body,
          htmlToPlain(prospect.email_body),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "SMTP error";
        // Mark bounced if address rejected
        if (msg.toLowerCase().includes("recipient") || msg.toLowerCase().includes("address")) {
          await sb.from("outreach_prospects").update({ status: "bounced", updated_at: new Date().toISOString() }).eq("id", id);
        }
        return NextResponse.json({ error: `Send failed: ${msg}` }, { status: 502 });
      }

      await sb.from("outreach_prospects").update({
        status: "sent",
        sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", id);

      return NextResponse.json({ ok: true, sent_to: prospect.email });
    }

    // ── Bulk send — all approved, up to daily limit ──
    const limit = getDailyLimit();
    const { data: prospects, error: listErr } = await sb
      .from("outreach_prospects")
      .select("*")
      .eq("status", "approved")
      .order("created_at", { ascending: true })
      .limit(limit);

    if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });
    if (!prospects?.length) return NextResponse.json({ ok: true, sent: 0, message: "No approved prospects to send." });

    let sent = 0;
    let failed = 0;
    for (const prospect of prospects) {
      if (!prospect.email || !prospect.email_subject || !prospect.email_body) continue;
      try {
        await sendEmail(
          prospect.email,
          prospect.email_subject,
          prospect.email_body,
          htmlToPlain(prospect.email_body),
        );
        await sb.from("outreach_prospects").update({
          status: "sent",
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", prospect.id);
        sent++;
      } catch {
        failed++;
        await sb.from("outreach_prospects").update({
          updated_at: new Date().toISOString(),
        }).eq("id", prospect.id);
      }
    }

    return NextResponse.json({ ok: true, sent, failed, limit });
  });
}
