import { NextResponse } from "next/server";
import {
  getDailyLimit,
  isConfiguredForCampaign,
  pickSubjectVariant,
} from "@/lib/outreach/campaign-env";
import { getPublicBaseUrl } from "@/lib/outreach/public-base-url";
import { sendOutreachEmail } from "@/lib/outreach/send-mail";
import { htmlToPlain, injectTracking } from "@/lib/outreach/tracking";
import { withSupabaseRoute } from "@/lib/with-supabase-route";

const FOLLOW_UP_DAYS = 3;

function normalizeCampaign(raw: unknown): string {
  return typeof raw === "string" && raw.trim() ? raw.trim().toLowerCase() : "pesttrace";
}

/** POST { id } or { bulk: true, campaign? } — send approved prospect email(s). */
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
        await sendOutreachEmail(
          campaign,
          prospect.email,
          subject,
          trackedHtml,
          htmlToPlain(trackedHtml),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "SMTP error";
        if (msg.toLowerCase().includes("recipient") || msg.toLowerCase().includes("address")) {
          await sb
            .from("outreach_prospects")
            .update({ status: "bounced", updated_at: new Date().toISOString() })
            .eq("id", id);
        }
        return NextResponse.json({ error: `Send failed: ${msg}` }, { status: 502 });
      }

      const now = new Date();
      const nextSendAt = new Date(now.getTime() + FOLLOW_UP_DAYS * 24 * 60 * 60 * 1000).toISOString();
      await sb
        .from("outreach_prospects")
        .update({
          status: "sent",
          sent_at: now.toISOString(),
          subject_variant: variant,
          next_send_at: nextSendAt,
          engagement_tier: "cold",
          updated_at: now.toISOString(),
        })
        .eq("id", id);

      return NextResponse.json({
        ok: true,
        sent_to: prospect.email,
        campaign,
        subject_variant: variant,
      });
    }

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
      return NextResponse.json({
        ok: true,
        sent: 0,
        campaign,
        message: "No approved prospects to send for this campaign.",
      });
    }

    let sent = 0;
    let failed = 0;
    let firstError: string | null = null;
    for (const prospect of prospects) {
      if (!prospect.email || (!prospect.email_subject && !prospect.email_subject_b) || !prospect.email_body)
        continue;
      const { subject, variant } = pickSubjectVariant(prospect.email_subject, prospect.email_subject_b);
      const trackedHtml = injectTracking(prospect.email_body, prospect.id, baseUrl);
      try {
        await sendOutreachEmail(
          campaign,
          prospect.email,
          subject,
          trackedHtml,
          htmlToPlain(trackedHtml),
        );
        const now = new Date();
        const nextSendAt = new Date(now.getTime() + FOLLOW_UP_DAYS * 24 * 60 * 60 * 1000).toISOString();
        await sb
          .from("outreach_prospects")
          .update({
            status: "sent",
            sent_at: now.toISOString(),
            subject_variant: variant,
            next_send_at: nextSendAt,
            engagement_tier: "cold",
            updated_at: now.toISOString(),
          })
          .eq("id", prospect.id);
        sent++;
      } catch (err) {
        failed++;
        if (!firstError) firstError = err instanceof Error ? err.message : String(err);
        await sb
          .from("outreach_prospects")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", prospect.id);
      }
    }

    if (sent === 0 && failed > 0) {
      return NextResponse.json(
        { ok: false, sent, failed, limit, campaign, error: `All ${failed} sends failed`, firstError },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true, sent, failed, limit, campaign, firstError });
  });
}
