import { NextResponse } from "next/server";
import { z } from "zod";
import { generateFollowUpCopy } from "@/lib/outreach/llm-followup";
import { withSupabaseRoute } from "@/lib/with-supabase-route";

const schema = z.object({ business_id: z.string().uuid() });

/** POST — LLM-generate outreach prompts for a business (marketing expert bootstrap). */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "business_id required" }, { status: 400 });
  }

  return withSupabaseRoute(async (sb) => {
    const { data: business, error: bizErr } = await sb
      .from("businesses")
      .select("*")
      .eq("id", parsed.data.business_id)
      .single();

    if (bizErr || !business) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    const { data: settings } = await sb
      .from("business_outreach_settings")
      .select("*")
      .eq("business_id", business.id)
      .maybeSingle();

    if (!settings) {
      return NextResponse.json({ error: "Enable outreach first" }, { status: 400 });
    }

    const prompt = `Generate cold B2B outreach campaign JSON for this business:
Name: ${business.name}
Type: ${business.type}
Audience: ${business.target_audience || "B2B decision makers"}
Industry: ${business.industry || "general"}
Goals: ${business.goals || "grow revenue"}
Website: ${business.website_url || ""}

Return JSON only:
{
  "subject_prompt": "LLM instructions for two A/B subject lines...",
  "body_prompt": "LLM instructions for email body max 180 words...",
  "follow_up_prompts": ["touch 2 prompt with {name} {website} {sector_angle}", "touch 3 break-up prompt"],
  "sector_angles": {"generic": "angle text", "restaurant": "..."},
  "scrape_queries": {"UK": [["search query", "City"], ...]}
}`;

    const { body: raw } = await generateFollowUpCopy({
      prompt,
      fallbackSubject: "",
      fallbackBody: "{}",
    });

    let generated: Record<string, unknown> = {};
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) generated = JSON.parse(match[0]) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "LLM returned invalid JSON — try again" }, { status: 502 });
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (typeof generated.subject_prompt === "string") updates.subject_prompt = generated.subject_prompt;
    if (typeof generated.body_prompt === "string") updates.body_prompt = generated.body_prompt;
    if (Array.isArray(generated.follow_up_prompts)) {
      updates.follow_up_prompts = generated.follow_up_prompts;
    }
    if (generated.sector_angles && typeof generated.sector_angles === "object") {
      updates.sector_angles = generated.sector_angles;
    }
    if (generated.scrape_queries && typeof generated.scrape_queries === "object") {
      updates.scrape_queries = generated.scrape_queries;
    }

    const { data: updated, error } = await sb
      .from("business_outreach_settings")
      .update(updates)
      .eq("business_id", business.id)
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, settings: updated });
  });
}
