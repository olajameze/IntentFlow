import { NextResponse } from "next/server";
import { z } from "zod";
import {
  brandingFromSettings,
  buildFollowUpPrompt,
  loadOutreachSettings,
  renderFollowUpHtmlForProspect,
} from "@/lib/outreach/campaign-config";
import { computeEngagementTier } from "@/lib/outreach/engagement";
import { generateFollowUpCopy } from "@/lib/outreach/llm-followup";
import { withSupabaseRoute } from "@/lib/with-supabase-route";

const schema = z.object({
  prospect_id: z.string().uuid(),
  touch_index: z.number().int().min(0).max(1).optional(),
});

/** POST — generate personalized follow-up subject + HTML for a prospect. */
export async function POST(req: Request) {
  const body = schema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  }

  return withSupabaseRoute(async (sb) => {
    const { data: prospect, error } = await sb
      .from("outreach_prospects")
      .select("*")
      .eq("id", body.data.prospect_id)
      .single();

    if (error || !prospect) {
      return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
    }

    const campaign = String(prospect.campaign || "pesttrace");
    const settings = await loadOutreachSettings(sb, campaign);
    const touchIndex =
      body.data.touch_index ?? Math.min(prospect.followup_count ?? 0, 1);
    const tier = computeEngagementTier(prospect);

    const { prompt, fallbackSubject, fallbackBody } = buildFollowUpPrompt(
      settings,
      campaign,
      {
        name: prospect.name || "there",
        website_url: prospect.website_url,
        sector: prospect.sector,
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
    const ctaUrl = ctaTemplate.replace("{prospect_id}", prospect.id);
    const html = renderFollowUpHtmlForProspect(branding, bodyText, prospect.id, ctaUrl);

    return NextResponse.json({
      ok: true,
      subject,
      body_text: bodyText,
      html,
      touch_index: touchIndex,
      engagement_tier: tier,
    });
  });
}

export const dynamic = "force-dynamic";
