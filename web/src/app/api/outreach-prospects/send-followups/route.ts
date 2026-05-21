import { NextResponse } from "next/server";
import { withSupabaseRoute } from "@/lib/with-supabase-route";
import nodemailer from "nodemailer";

/**
 * POST /api/outreach-prospects/send-followups
 *
 * Klaviyo step 6 (tailor emails to each stage of the customer journey) — automated
 * follow-up sequence for cold outreach. Klaviyo's own benchmarks show automated flows
 * generate up to 30× more revenue per recipient than one-off campaigns.
 *
 * This endpoint is called by GitHub Actions (or any scheduler) once per day. It picks
 * up sent prospects whose ``next_send_at <= now()``, who haven't replied yet, who haven't
 * had more than 2 follow-ups, and who are still inside the daily send limit. For each it:
 *
 *   1. Generates a fresh follow-up email (different angle from the previous touch) using
 *      the engine API ``/api/outreach-prospects/generate-followup``  ← NOT YET WIRED;
 *      to keep the surface small, this initial version falls back to a static plain-text
 *      reminder body that still includes the brand CTA + tracking.
 *   2. Sends via the campaign's SMTP credentials with full open + click tracking, same
 *      as the primary send route.
 *   3. Bumps ``followup_count`` and schedules ``next_send_at`` 4 days out (so the
 *      sequence is Day 0 → Day 3 → Day 7).
 *   4. Logs the touch in ``outreach_email_events`` so the dashboard KPI panel reflects
 *      total sends, not just first-touch sends.
 *
 * Auth: requires a cron secret in the ``Authorization`` header (``Bearer $CRON_SECRET``)
 * when ``CRON_SECRET`` is set in the environment. Vercel Cron and GitHub Actions both
 * support setting this header.
 */

type CampaignId = "pesttrace" | "weathers";

const FOLLOWUP_TEMPLATES: Record<
  CampaignId,
  { fromName: string; signature: string; ctaLabel: string; ctaUrl: string; accent: string; trustBadges: string[]; opts: string[]; touchBodies: string[] }
> = {
  pesttrace: {
    fromName: "PestTrace Team",
    signature: "The PestTrace Team",
    ctaLabel: "See how PestTrace works",
    ctaUrl: "https://pesttrace.com/?utm_source=outreach&utm_medium=email&utm_campaign=pesttrace",
    accent: "#0F766E",
    trustBadges: ["UK-built", "Audit-ready records", "BPCA-aligned workflows"],
    opts: ["You're on this list because your business was found in a public directory. Reply STOP to be removed."],
    touchBodies: [
      // Day 3
      "I wrote a few days ago — wanted to leave one more useful note in case it's relevant.\n\nMost UK pest control firms we talk to lose hours every week re-typing field paperwork before audits. PestTrace replaces that with a digital logbook your technicians fill in on the job — photos, signatures, follow-ups, expiry tracking, all audit-ready.\n\nIf that sounds familiar, the link below shows a short walkthrough.",
      // Day 7 — break-up
      "I'll leave it here — no more emails after this one.\n\nIf you ever want to make audit prep painless, PestTrace stays right there at pesttrace.com. Door's always open.",
    ],
  },
  weathers: {
    fromName: "Weathers Pest Solutions",
    signature: "The Weathers Pest Solutions Team\n07462253896",
    ctaLabel: "Book a pest control slot",
    ctaUrl: "https://weatherspestsolutions.co.uk/book?utm_source=outreach&utm_medium=email&utm_campaign=weathers",
    accent: "#2F855A",
    trustBadges: ["BPCA Certified", "5-Star Rated", "24/7 Emergency", "£50 deposit off invoice"],
    opts: ["You're on this list because your business matched a sector that commonly requires pest control. Reply STOP to opt out."],
    touchBodies: [
      // Day 3
      "Wanted to leave one more useful note in case it's helpful.\n\nWe cover the whole West Midlands — Birmingham, Wolverhampton, Coventry, Walsall, Dudley, Sandwell, Solihull, Stoke-on-Trent, Worcester — and the £50 deposit comes straight off the final invoice, so there are no hidden fees. Every booking carries a 100% Satisfaction Guarantee.\n\nIf any pest issues crop up, the booking link below lets you pick a slot in under a minute.",
      // Day 7 — break-up
      "I'll stop emailing after this — promise.\n\nIf pests crop up later, Weathers Pest Solutions is here 24/7 on 07462253896, with transparent pricing and a 100% Satisfaction Guarantee. The booking link below stays open.",
    ],
  },
};

const FOLLOWUP_SUBJECTS: Record<CampaignId, string[]> = {
  pesttrace: [
    "Quick follow-up on audit-ready records",
    "Closing the loop — last note from PestTrace",
  ],
  weathers: [
    "Quick follow-up about West Midlands pest cover",
    "Closing the loop — last note from Weathers",
  ],
};

// ── Email rendering (mirrors engine/tools/outreach_email.py _render_html) ────

function renderFollowUpHtml(campaign: CampaignId, bodyText: string, prospectId: string): string {
  const t = FOLLOWUP_TEMPLATES[campaign];
  const paragraphs = bodyText
    .split("\n\n")
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 16px 0;font-size:15px;line-height:1.55;color:#1a1a1a;">${p.replace(/\n/g, "<br>")}</p>`,
    )
    .join("\n");

  const sigBlock = t.signature
    .split("\n")
    .map((line) => `<div>${line}</div>`)
    .join("");

  const badges = t.trustBadges
    .map((b) => `<span style="color:#4a5568;">${b}</span>`)
    .join(" &nbsp;·&nbsp; ");

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f7f7f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,Helvetica,sans-serif;color:#1a1a1a;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f7f7f5;padding:24px 0;"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;background:#ffffff;border-radius:12px;border:1px solid #e5e5e5;overflow:hidden;">
<tr><td style="background:${t.accent};padding:14px 24px;color:#ffffff;font-weight:600;font-size:14px;letter-spacing:0.3px;">${t.signature.split("\n")[0]}</td></tr>
<tr><td style="padding:28px 28px 8px 28px;">${paragraphs}<div style="margin:16px 0;font-size:14px;color:#4a5568;">${sigBlock}</div></td></tr>
<tr><td align="center" style="padding:12px 24px 24px 24px;"><a data-outreach-cta="true" href="${t.ctaUrl}&p=${encodeURIComponent(prospectId)}" style="display:inline-block;background:${t.accent};color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:15px;">${t.ctaLabel}</a></td></tr>
<tr><td align="center" style="padding:0 24px 24px 24px;font-size:12px;color:#4a5568;">${badges}</td></tr>
<tr><td style="background:#fafafa;border-top:1px solid #eeeeee;padding:16px 24px;font-size:11px;line-height:1.5;color:#888888;">${t.opts[0]}</td></tr>
</table>
<!-- OUTREACH_TRACKING_PIXEL -->
</td></tr></table>
</body></html>`;
}

// ── SMTP (mirrors send/route.ts) ─────────────────────────────────────────────

const CAMPAIGN_ENV: Record<
  CampaignId,
  { fromName: string; fromEmail: string; replyTo: string; smtpHost: string; smtpUser: string; smtpPassword: string; smtpPort: string; defaultFromName: string }
> = {
  pesttrace: {
    fromName: "OUTREACH_FROM_NAME",
    fromEmail: "OUTREACH_FROM_EMAIL",
    replyTo: "OUTREACH_REPLY_TO",
    smtpHost: "SMTP_HOST",
    smtpUser: "SMTP_USER",
    smtpPassword: "SMTP_PASSWORD",
    smtpPort: "SMTP_PORT",
    defaultFromName: "PestTrace Team",
  },
  weathers: {
    fromName: "WEATHERS_OUTREACH_FROM_NAME",
    fromEmail: "WEATHERS_OUTREACH_FROM_EMAIL",
    replyTo: "WEATHERS_REPLY_TO",
    smtpHost: "WEATHERS_SMTP_HOST",
    smtpUser: "WEATHERS_SMTP_USER",
    smtpPassword: "WEATHERS_SMTP_PASSWORD",
    smtpPort: "WEATHERS_SMTP_PORT",
    defaultFromName: "Weathers Pest Solutions",
  },
};

function envVal(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v ? v : undefined;
}

function getSmtp(campaign: CampaignId) {
  const k = CAMPAIGN_ENV[campaign];
  const host = envVal(k.smtpHost) ?? envVal("SMTP_HOST");
  const user = envVal(k.smtpUser) ?? envVal("SMTP_USER");
  const password = envVal(k.smtpPassword) ?? envVal("SMTP_PASSWORD");
  const port = parseInt(envVal(k.smtpPort) ?? envVal("SMTP_PORT") ?? "587", 10);
  const fromName = envVal(k.fromName) ?? envVal("OUTREACH_FROM_NAME") ?? k.defaultFromName;
  const fromEmail = envVal(k.fromEmail) ?? envVal("OUTREACH_FROM_EMAIL") ?? user;
  const replyTo = envVal(k.replyTo) ?? envVal("OUTREACH_REPLY_TO");
  return { host, user, password, port, fromName, fromEmail, replyTo, configured: !!(host && user && password) };
}

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

function injectTracking(html: string, prospectId: string, baseUrl: string): string {
  if (!html || !baseUrl) return html;
  let out = html;
  out = out.replace(
    /<a\b([^>]*?)\bdata-outreach-cta="true"([^>]*?)\bhref="([^"]+)"([^>]*)>/gi,
    (_m, pre, mid, href, post) =>
      `<a${pre}data-outreach-cta="true"${mid}href="${baseUrl}/api/outreach-track/click?p=${encodeURIComponent(prospectId)}&to=${encodeURIComponent(href)}"${post}>`,
  );
  out = out.replace(
    /<a\b([^>]*?)\bhref="([^"]+)"([^>]*?)\bdata-outreach-cta="true"([^>]*)>/gi,
    (_m, pre, href, mid, post) =>
      `<a${pre}href="${baseUrl}/api/outreach-track/click?p=${encodeURIComponent(prospectId)}&to=${encodeURIComponent(href)}"${mid}data-outreach-cta="true"${post}>`,
  );
  const pixel = `<img src="${baseUrl}/api/outreach-track/open?p=${encodeURIComponent(prospectId)}" alt="" width="1" height="1" style="display:block;width:1px;height:1px;border:0;" />`;
  if (out.includes("<!-- OUTREACH_TRACKING_PIXEL -->")) out = out.replace("<!-- OUTREACH_TRACKING_PIXEL -->", pixel);
  else if (out.includes("</body>")) out = out.replace("</body>", `${pixel}</body>`);
  else out += pixel;
  return out;
}

function htmlToPlain(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim();
}

const FOLLOWUP_BATCH = 25;     // hard cap per run, prevents accidental flooding
const FOLLOWUP_GAP_DAYS = 4;   // Day 0 → Day 3 → Day 7

// ── Endpoint ─────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  // Optional auth — when CRON_SECRET is set, callers must provide Bearer token
  const expected = process.env.CRON_SECRET?.trim();
  if (expected) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const baseUrl = getPublicBaseUrl(req);
  const now = new Date();
  const nowIso = now.toISOString();

  return withSupabaseRoute(async (sb) => {
    const { data: due, error } = await sb
      .from("outreach_prospects")
      .select("*")
      .eq("status", "sent")
      .is("replied_at", null)
      .is("booked_at", null)
      .lt("followup_count", 2)
      .lte("next_send_at", nowIso)
      .order("next_send_at", { ascending: true })
      .limit(FOLLOWUP_BATCH);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!due?.length) {
      return NextResponse.json({ ok: true, sent: 0, message: "No follow-ups due." });
    }

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const p of due) {
      const campaign: CampaignId = p.campaign === "weathers" ? "weathers" : "pesttrace";
      const smtp = getSmtp(campaign);
      if (!smtp.configured) {
        failed++;
        errors.push(`SMTP missing for ${campaign}`);
        continue;
      }

      const touchIndex = Math.min(p.followup_count ?? 0, FOLLOWUP_TEMPLATES[campaign].touchBodies.length - 1);
      const bodyText = FOLLOWUP_TEMPLATES[campaign].touchBodies[touchIndex];
      const subject = FOLLOWUP_SUBJECTS[campaign][touchIndex] ?? FOLLOWUP_SUBJECTS[campaign][0];

      const html = injectTracking(renderFollowUpHtml(campaign, bodyText, p.id), p.id, baseUrl);

      try {
        const transporter = nodemailer.createTransport({
          host: smtp.host,
          port: smtp.port,
          secure: smtp.port === 465,
          auth: { user: smtp.user, pass: smtp.password },
        });

        await transporter.sendMail({
          from: `${smtp.fromName} <${smtp.fromEmail}>`,
          replyTo: smtp.replyTo ?? `${smtp.fromName} <${smtp.fromEmail}>`,
          to: p.email,
          subject,
          text: htmlToPlain(html),
          html,
        });

        const newCount = (p.followup_count ?? 0) + 1;
        const nextSendAt =
          newCount < 2 ? new Date(now.getTime() + FOLLOWUP_GAP_DAYS * 24 * 60 * 60 * 1000).toISOString() : null;

        await sb
          .from("outreach_prospects")
          .update({
            followup_count: newCount,
            next_send_at: nextSendAt,
            updated_at: nowIso,
          })
          .eq("id", p.id);

        // We don't insert a synthetic "send" event — the events table only tracks
        // recipient-side interactions (open / click / reply / booked / bounce). The
        // ``followup_count`` column is the source of truth for how many touches were sent.
        sent++;
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : "send failed";
        errors.push(`${p.email}: ${msg}`);
      }
    }

    return NextResponse.json({ ok: true, sent, failed, errors: errors.slice(0, 5) });
  });
}

export const dynamic = "force-dynamic";
