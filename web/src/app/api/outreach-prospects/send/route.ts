import { NextResponse } from "next/server";
import { withSupabaseRoute } from "@/lib/with-supabase-route";
import nodemailer from "nodemailer";

function getSmtpConfig() {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASSWORD?.trim();
  const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
  const fromName = process.env.OUTREACH_FROM_NAME?.trim() || "PestTrace Team";
  return { host, user, password, port, fromName, configured: !!(host && user && password) };
}

function getDailyLimit(): number {
  const raw = process.env.OUTREACH_DAILY_SEND_LIMIT;
  const n = parseInt(raw ?? "20", 10);
  return Number.isFinite(n) && n > 0 ? n : 20;
}

async function sendEmail(
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
    from: `${cfg.fromName} <${cfg.user}>`,
    to,
    subject,
    text: plain,
    html,
  });
}

function htmlToPlain(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim();
}

/** POST { id } — send a single approved prospect's email */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const bulk = body.bulk === true;

  const cfg = getSmtpConfig();
  if (!cfg.configured) {
    return NextResponse.json(
      {
        error: "SMTP is not configured.",
        hint: "Add SMTP_HOST, SMTP_USER, SMTP_PASSWORD (and SMTP_PORT, OUTREACH_FROM_NAME) to your environment variables. For Gmail use an App Password.",
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
