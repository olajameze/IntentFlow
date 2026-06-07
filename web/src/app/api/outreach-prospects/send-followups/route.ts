import { NextResponse } from "next/server";
import {
  brandingFromSettings,
  buildFollowUpPrompt,
  loadOutreachSettings,
  renderFollowUpHtmlForProspect,
} from "@/lib/outreach/campaign-config";
import { computeEngagementTier } from "@/lib/outreach/engagement";
import {
  isFollowUpDue,
  MAX_FOLLOWUPS,
  nextFollowUpAt,
} from "@/lib/outreach/followup-schedule";
import { generateFollowUpCopy } from "@/lib/outreach/llm-followup";
import { getPublicBaseUrl } from "@/lib/outreach/public-base-url";
import { isConfiguredForCampaign } from "@/lib/outreach/campaign-env";
import { validateEmailForSend } from "@/lib/outreach/send-validation";
import { sendOutreachEmail } from "@/lib/outreach/send-mail";
import { injectTracking } from "@/lib/outreach/tracking";
import { withSupabaseRoute } from "@/lib/with-supabase-route";

const FOLLOWUP_BATCH = 25;
const HOT_DAILY_CAP = 10;

/** POST — 4-touch sequence follow-ups (Day 3 / 7 / 14 from initial send). */
export async function POST(req: Request) {
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
      .lt("followup_count", MAX_FOLLOWUPS)
      .not("sent_at", "is", null)
      .order("next_send_at", { ascending: true })
      .limit(FOLLOWUP_BATCH * 3);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const eligible = (due ?? []).filter((p) => {
      const sentAt = String(p.sent_at || "");
      const count = p.followup_count ?? 0;
      if (!sentAt || count >= MAX_FOLLOWUPS) return false;
      return isFollowUpDue(sentAt, count, now);
    });

    if (!eligible.length) {
      return NextResponse.json({ ok: true, sent: 0, message: "No follow-ups due." });
    }

    const tierRank: Record<string, number> = { hot: 0, warm: 1, cold: 2 };
    const sorted = [...eligible]
      .sort((a, b) => {
        const ta = tierRank[computeEngagementTier(a)] ?? 2;
        const tb = tierRank[computeEngagementTier(b)] ?? 2;
        if (ta !== tb) return ta - tb;
        return String(a.next_send_at).localeCompare(String(b.next_send_at));
      })
      .slice(0, FOLLOWUP_BATCH);

    let sent = 0;
    let failed = 0;
    let hotSentToday = 0;
    const errors: string[] = [];

    for (const p of sorted) {
      const campaign = String(p.campaign || "pesttrace");
      const check = isConfiguredForCampaign(campaign);
      if (!check.ok) {
        failed++;
        errors.push(`Email not configured for ${campaign}`);
        continue;
      }

      const tier = computeEngagementTier(p);
      if (tier === "hot" && hotSentToday >= HOT_DAILY_CAP) continue;

      const touchIndex = Math.min(p.followup_count ?? 0, MAX_FOLLOWUPS - 1);
      const settings = await loadOutreachSettings(sb, campaign);
      const { prompt, fallbackSubject, fallbackBody } = buildFollowUpPrompt(
        settings,
        campaign,
        {
          name: p.name || "there",
          website_url: p.website_url,
          sector: p.sector,
          country: p.country,
          city: p.city,
          raw: p.raw as { research?: Record<string, unknown> } | null,
        },
        touchIndex,
        tier,
      );

      const { subject, body: bodyText } = await generateFollowUpCopy({
        prompt,
        fallbackSubject,
        fallbackBody,
        prospectId: p.id,
        campaign,
      });

      const branding = brandingFromSettings(settings, campaign);
      const ctaTemplate = settings?.cta_url_template || branding.ctaUrl;
      const ctaUrl = ctaTemplate.replace("{prospect_id}", p.id);
      const html = injectTracking(
        renderFollowUpHtmlForProspect(branding, bodyText, p.id, ctaUrl),
        p.id,
        baseUrl,
      );

      const validation = validateEmailForSend(subject, html, "followup");
      if (!validation.ok) {
        failed++;
        errors.push(`${p.email}: validation failed — ${validation.issues.join("; ")}`);
        continue;
      }

      try {
        await sendOutreachEmail(
          campaign,
          p.email,
          validation.subject,
          html,
          validation.plainBody,
          { prospectId: p.id },
        );

        const newCount = (p.followup_count ?? 0) + 1;
        const sentAtIso = String(p.sent_at);
        const nextSend = nextFollowUpAt(sentAtIso, newCount);

        await sb
          .from("outreach_prospects")
          .update({
            followup_count: newCount,
            sequence_step: newCount,
            next_send_at: nextSend,
            delivered_at: nowIso,
            engagement_tier: tier,
            updated_at: nowIso,
          })
          .eq("id", p.id);

        await sb.from("outreach_email_events").insert({
          prospect_id: p.id,
          campaign,
          event_type: "sent",
        });

        if (tier === "hot") hotSentToday++;
        sent++;
      } catch (err) {
        failed++;
        errors.push(`${p.email}: ${err instanceof Error ? err.message : "send failed"}`);
      }
    }

    return NextResponse.json({ ok: true, sent, failed, errors: errors.slice(0, 5) });
  });
}

export const dynamic = "force-dynamic";
