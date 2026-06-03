import { NextResponse } from "next/server";
import {
  brandingFromSettings,
  buildFollowUpPrompt,
  loadOutreachSettings,
  renderFollowUpHtmlForProspect,
} from "@/lib/outreach/campaign-config";
import { followUpGapDays, computeEngagementTier } from "@/lib/outreach/engagement";
import { generateFollowUpCopy } from "@/lib/outreach/llm-followup";
import { getPublicBaseUrl } from "@/lib/outreach/public-base-url";
import { isConfiguredForCampaign } from "@/lib/outreach/campaign-env";
import { sendOutreachEmail } from "@/lib/outreach/send-mail";
import { htmlToPlain, injectTracking } from "@/lib/outreach/tracking";
import { withSupabaseRoute } from "@/lib/with-supabase-route";

const FOLLOWUP_BATCH = 25;
const HOT_DAILY_CAP = 10;

/** POST — behavior-aware follow-up sequence (cron / GitHub Actions). */
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
      .lt("followup_count", 2)
      .lte("next_send_at", nowIso)
      .order("next_send_at", { ascending: true })
      .limit(FOLLOWUP_BATCH * 2);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!due?.length) {
      return NextResponse.json({ ok: true, sent: 0, message: "No follow-ups due." });
    }

    const tierRank: Record<string, number> = { hot: 0, warm: 1, cold: 2 };
    const sorted = [...due].sort((a, b) => {
      const ta = tierRank[computeEngagementTier(a)] ?? 2;
      const tb = tierRank[computeEngagementTier(b)] ?? 2;
      if (ta !== tb) return ta - tb;
      return String(a.next_send_at).localeCompare(String(b.next_send_at));
    }).slice(0, FOLLOWUP_BATCH);

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

      const touchIndex = Math.min(p.followup_count ?? 0, 1);
      const settings = await loadOutreachSettings(sb, campaign);
      const { prompt, fallbackSubject, fallbackBody } = buildFollowUpPrompt(
        settings,
        campaign,
        {
          name: p.name || "there",
          website_url: p.website_url,
          sector: p.sector,
        },
        touchIndex,
        tier,
      );

      const { subject, body: bodyText } = await generateFollowUpCopy({
        prompt,
        fallbackSubject,
        fallbackBody,
      });

      const branding = brandingFromSettings(settings, campaign);
      const ctaTemplate = settings?.cta_url_template || branding.ctaUrl;
      const ctaUrl = ctaTemplate.replace("{prospect_id}", p.id);
      const html = injectTracking(
        renderFollowUpHtmlForProspect(branding, bodyText, p.id, ctaUrl),
        p.id,
        baseUrl,
      );

      try {
        await sendOutreachEmail(
          campaign,
          p.email,
          subject,
          html,
          htmlToPlain(html),
        );

        const newCount = (p.followup_count ?? 0) + 1;
        const gapDays = followUpGapDays(tier, newCount);
        const nextSendAt =
          newCount < 2 && gapDays > 0
            ? new Date(now.getTime() + gapDays * 24 * 60 * 60 * 1000).toISOString()
            : null;

        await sb
          .from("outreach_prospects")
          .update({
            followup_count: newCount,
            next_send_at: nextSendAt,
            engagement_tier: tier,
            updated_at: nowIso,
          })
          .eq("id", p.id);

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
