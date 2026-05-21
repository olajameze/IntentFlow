import { NextResponse } from "next/server";
import { withSupabaseRoute } from "@/lib/with-supabase-route";
import nodemailer from "nodemailer";

type EmailProvider = "smtp" | "resend" | "auto";

/**
 * Per-campaign env-var overrides. When a key resolves to a non-empty value via
 * ``process.env``, it takes precedence over the shared OUTREACH_/SMTP_/RESEND_ defaults.
 * This is what lets the Weathers campaign send from WeathersPestSolutions@hotmail.com
 * while PestTrace keeps sending from its own mailbox.
 */
const CAMPAIGN_ENV = {
  pesttrace: {
    fromName: "OUTREACH_FROM_NAME",
    fromEmail: "OUTREACH_FROM_EMAIL",
    replyTo: "OUTREACH_REPLY_TO",
    smtpHost: "SMTP_HOST",
    smtpUser: "SMTP_USER",
    smtpPassword: "SMTP_PASSWORD",
    smtpPort: "SMTP_PORT",
    resendApiKey: "RESEND_API_KEY",
    defaultFromName: "PestTrace Team",
  },
  weathers: {
    fromName: "WEATHERS_OUTREACH_FROM_NAME",
    fromEmail: "WEATHERS_OUTREACH_FROM_EMAIL",
    // Set this to the address you want replies to land in — useful when relaying
    // from a domain mailbox (e.g. info@weatherspestsolutions.co.uk) but want replies
    // to come back to the Hotmail inbox the operator actually monitors.
    replyTo: "WEATHERS_REPLY_TO",
    smtpHost: "WEATHERS_SMTP_HOST",
    smtpUser: "WEATHERS_SMTP_USER",
    smtpPassword: "WEATHERS_SMTP_PASSWORD",
    smtpPort: "WEATHERS_SMTP_PORT",
    resendApiKey: "WEATHERS_RESEND_API_KEY",
    defaultFromName: "Weathers Pest Solutions",
  },
} as const;

type CampaignId = keyof typeof CAMPAIGN_ENV;

function normalizeCampaign(raw: unknown): CampaignId {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return v === "weathers" ? "weathers" : "pesttrace";
}

function envVal(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v ? v : undefined;
}

function getEmailProvider(): EmailProvider {
  const raw = process.env.OUTREACH_EMAIL_PROVIDER?.trim().toLowerCase();
  if (raw === "smtp" || raw === "resend" || raw === "auto") return raw;
  return "auto";
}

function getBaseConfig(campaign: CampaignId) {
  const keys = CAMPAIGN_ENV[campaign];
  const fromName =
    envVal(keys.fromName) ?? envVal(CAMPAIGN_ENV.pesttrace.fromName) ?? keys.defaultFromName;
  const fromEmail =
    envVal(keys.fromEmail) ?? envVal(CAMPAIGN_ENV.pesttrace.fromEmail) ?? envVal(keys.smtpUser) ?? envVal("SMTP_USER");
  const replyTo = envVal(keys.replyTo) ?? envVal(CAMPAIGN_ENV.pesttrace.replyTo);
  return { fromName, fromEmail, replyTo };
}

function getSmtpConfig(campaign: CampaignId) {
  const keys = CAMPAIGN_ENV[campaign];
  const host = envVal(keys.smtpHost) ?? envVal("SMTP_HOST");
  const user = envVal(keys.smtpUser) ?? envVal("SMTP_USER");
  const password = envVal(keys.smtpPassword) ?? envVal("SMTP_PASSWORD");
  const portRaw = envVal(keys.smtpPort) ?? envVal("SMTP_PORT") ?? "587";
  const port = parseInt(portRaw, 10);
  const { fromName, fromEmail, replyTo } = getBaseConfig(campaign);
  return { host, user, password, port, fromName, fromEmail, replyTo, configured: !!(host && user && password) };
}

function getResendConfig(campaign: CampaignId) {
  const keys = CAMPAIGN_ENV[campaign];
  const apiKey = envVal(keys.resendApiKey) ?? envVal("RESEND_API_KEY");
  const { fromName, fromEmail, replyTo } = getBaseConfig(campaign);
  return { apiKey, fromName, fromEmail, replyTo, configured: !!(apiKey && fromEmail) };
}

function getDailyLimit(): number {
  const raw = process.env.OUTREACH_DAILY_SEND_LIMIT;
  const n = parseInt(raw ?? "20", 10);
  return Number.isFinite(n) && n > 0 ? n : 20;
}

async function sendEmailViaSmtp(
  campaign: CampaignId,
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
  campaign: CampaignId,
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

async function sendEmail(
  campaign: CampaignId,
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

function htmlToPlain(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim();
}

/** Resolve the absolute base URL the recipient inbox will use to reach our tracking endpoints.
 *
 * Priority:
 *   1. ``OUTREACH_PUBLIC_BASE_URL`` — explicit override (e.g. "https://intentflow.app").
 *   2. ``NEXT_PUBLIC_SITE_URL`` — Vercel project URL used elsewhere.
 *   3. ``VERCEL_PROJECT_PRODUCTION_URL`` — auto-populated on Vercel.
 *   4. Fall back to the request's own origin — works locally and in preview, but inbox
 *      tracking won't fire from a recipient's inbox unless this host is publicly reachable.
 */
function getPublicBaseUrl(req: Request): string {
  const fromEnv =
    process.env.OUTREACH_PUBLIC_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.trim()}`
      : "");
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  try {
    return new URL(req.url).origin;
  } catch {
    return "";
  }
}

/** Rewrite the email body for delivery:
 *   • Every CTA anchor (``data-outreach-cta="true"``) → /api/outreach-track/click redirector
 *   • The ``<!-- OUTREACH_TRACKING_PIXEL -->`` comment → real 1×1 open-tracking pixel
 *
 * Both are best-effort: if ``baseUrl`` is empty we leave the body alone so the email still
 * reaches the recipient even when tracking is misconfigured.
 */
function injectTracking(html: string, prospectId: string, baseUrl: string): string {
  if (!html || !baseUrl) return html;

  let out = html;

  // Wrap CTA anchors. We match the data attribute irrespective of attribute order.
  out = out.replace(
    /<a\b([^>]*?)\bdata-outreach-cta="true"([^>]*?)\bhref="([^"]+)"([^>]*)>/gi,
    (_match, pre, mid, href, post) => {
      const tracked = `${baseUrl}/api/outreach-track/click?p=${encodeURIComponent(prospectId)}&to=${encodeURIComponent(href)}`;
      return `<a${pre}data-outreach-cta="true"${mid}href="${tracked}"${post}>`;
    },
  );
  // Same pattern but href appears before data-outreach-cta
  out = out.replace(
    /<a\b([^>]*?)\bhref="([^"]+)"([^>]*?)\bdata-outreach-cta="true"([^>]*)>/gi,
    (_match, pre, href, mid, post) => {
      const tracked = `${baseUrl}/api/outreach-track/click?p=${encodeURIComponent(prospectId)}&to=${encodeURIComponent(href)}`;
      return `<a${pre}href="${tracked}"${mid}data-outreach-cta="true"${post}>`;
    },
  );

  // Open pixel — replace the placeholder. If the placeholder is missing, append at end of body.
  const pixel = `<img src="${baseUrl}/api/outreach-track/open?p=${encodeURIComponent(prospectId)}" alt="" width="1" height="1" style="display:block;width:1px;height:1px;border:0;" />`;
  if (out.includes("<!-- OUTREACH_TRACKING_PIXEL -->")) {
    out = out.replace("<!-- OUTREACH_TRACKING_PIXEL -->", pixel);
  } else if (out.includes("</body>")) {
    out = out.replace("</body>", `${pixel}</body>`);
  } else {
    out += pixel;
  }

  return out;
}

/** A/B subject selection — Klaviyo step 8.
 *
 * If both ``email_subject`` and ``email_subject_b`` are populated, flip a fair coin per
 * recipient and return both the chosen subject and its variant label (``"A"`` or ``"B"``).
 * Legacy rows without an ``email_subject_b`` always send variant A.
 */
function pickSubjectVariant(a: string | null, b: string | null): { subject: string; variant: "A" | "B" } {
  const sA = (a || "").trim();
  const sB = (b || "").trim();
  if (sA && sB) {
    const pickB = Math.random() < 0.5;
    return { subject: pickB ? sB : sA, variant: pickB ? "B" : "A" };
  }
  return { subject: sA || sB || "", variant: "A" };
}

const FOLLOW_UP_DAYS = 3;

function isConfiguredForCampaign(campaign: CampaignId): { ok: boolean; hint?: string } {
  const provider = getEmailProvider();
  const smtpCfg = getSmtpConfig(campaign);
  const resendCfg = getResendConfig(campaign);
  const keys = CAMPAIGN_ENV[campaign];

  const ok =
    provider === "smtp"
      ? smtpCfg.configured
      : provider === "resend"
        ? resendCfg.configured
        : smtpCfg.configured || resendCfg.configured;

  if (ok) return { ok: true };

  const hint =
    campaign === "weathers"
      ? `Set WEATHERS SMTP credentials in web/.env.local: ${keys.smtpHost}=smtp-mail.outlook.com, ${keys.smtpUser}=WeathersPestSolutions@hotmail.com, ${keys.smtpPassword}=<Outlook app password>. (Outlook/Hotmail requires an app password — not the mailbox login password. Generate one at https://account.live.com/proofs/AppPassword.) Then restart npm run dev.`
      : `Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD (and OUTREACH_FROM_EMAIL) in web/.env.local for the PestTrace campaign. Restart npm run dev after saving.`;
  return { ok: false, hint };
}

/** POST { id } or { bulk: true, campaign? } — send a single approved prospect's email or all approved in one campaign. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const bulk = body.bulk === true;
  const baseUrl = getPublicBaseUrl(req);

  return withSupabaseRoute(async (sb) => {
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
      if (!prospect.email || (!prospect.email_subject && !prospect.email_subject_b) || !prospect.email_body) {
        return NextResponse.json({ error: "Missing email address, subject, or body." }, { status: 400 });
      }

      const campaign = normalizeCampaign(prospect.campaign);
      const check = isConfiguredForCampaign(campaign);
      if (!check.ok) {
        return NextResponse.json(
          { error: `Email sender is not configured for campaign '${campaign}'.`, hint: check.hint },
          { status: 400 },
        );
      }

      const { subject, variant } = pickSubjectVariant(prospect.email_subject, prospect.email_subject_b);
      const trackedHtml = injectTracking(prospect.email_body, prospect.id, baseUrl);

      try {
        await sendEmail(
          campaign,
          prospect.email,
          subject,
          trackedHtml,
          htmlToPlain(trackedHtml),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "SMTP error";
        if (msg.toLowerCase().includes("recipient") || msg.toLowerCase().includes("address")) {
          await sb.from("outreach_prospects").update({ status: "bounced", updated_at: new Date().toISOString() }).eq("id", id);
        }
        return NextResponse.json({ error: `Send failed: ${msg}` }, { status: 502 });
      }

      const now = new Date();
      const nextSendAt = new Date(now.getTime() + FOLLOW_UP_DAYS * 24 * 60 * 60 * 1000).toISOString();
      await sb.from("outreach_prospects").update({
        status: "sent",
        sent_at: now.toISOString(),
        subject_variant: variant,
        // Schedule follow-up #1 ~3 days from now (touched up by the follow-up cron)
        next_send_at: nextSendAt,
        updated_at: now.toISOString(),
      }).eq("id", id);

      return NextResponse.json({ ok: true, sent_to: prospect.email, campaign, subject_variant: variant });
    }

    // ── Bulk send — all approved in one campaign, up to daily limit ──
    const campaign = normalizeCampaign(body.campaign);
    const check = isConfiguredForCampaign(campaign);
    if (!check.ok) {
      return NextResponse.json(
        { error: `Email sender is not configured for campaign '${campaign}'.`, hint: check.hint },
        { status: 400 },
      );
    }

    const limit = getDailyLimit();
    const { data: prospects, error: listErr } = await sb
      .from("outreach_prospects")
      .select("*")
      .eq("status", "approved")
      .eq("campaign", campaign)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });
    if (!prospects?.length) {
      return NextResponse.json({ ok: true, sent: 0, campaign, message: "No approved prospects to send for this campaign." });
    }

    let sent = 0;
    let failed = 0;
    for (const prospect of prospects) {
      if (!prospect.email || (!prospect.email_subject && !prospect.email_subject_b) || !prospect.email_body) continue;
      const { subject, variant } = pickSubjectVariant(prospect.email_subject, prospect.email_subject_b);
      const trackedHtml = injectTracking(prospect.email_body, prospect.id, baseUrl);
      try {
        await sendEmail(
          campaign,
          prospect.email,
          subject,
          trackedHtml,
          htmlToPlain(trackedHtml),
        );
        const now = new Date();
        const nextSendAt = new Date(now.getTime() + FOLLOW_UP_DAYS * 24 * 60 * 60 * 1000).toISOString();
        await sb.from("outreach_prospects").update({
          status: "sent",
          sent_at: now.toISOString(),
          subject_variant: variant,
          next_send_at: nextSendAt,
          updated_at: now.toISOString(),
        }).eq("id", prospect.id);
        sent++;
      } catch {
        failed++;
        await sb.from("outreach_prospects").update({
          updated_at: new Date().toISOString(),
        }).eq("id", prospect.id);
      }
    }

    return NextResponse.json({ ok: true, sent, failed, limit, campaign });
  });
}
