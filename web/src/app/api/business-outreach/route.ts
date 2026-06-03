import { NextResponse } from "next/server";
import { z } from "zod";
import { withSupabaseRoute } from "@/lib/with-supabase-route";
import { randomBytes } from "crypto";

function slugify(name: string, businessId: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
  const suffix = businessId.replace(/-/g, "").slice(0, 8);
  return `${base || "business"}-${suffix}`;
}

const patchSchema = z.object({
  business_id: z.string().uuid(),
  enabled: z.boolean().optional(),
  cta_url_template: z.string().min(8).max(2000).optional(),
  cta_label: z.string().min(1).max(80).optional(),
  accent_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  regenerate_secret: z.boolean().optional(),
});

export async function GET(req: Request) {
  return withSupabaseRoute(async (sb) => {
    const businessId = new URL(req.url).searchParams.get("business_id");
    if (businessId) {
      const { data, error } = await sb
        .from("business_outreach_settings")
        .select("*")
        .eq("business_id", businessId)
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(data ?? null);
    }

    const { data, error } = await sb
      .from("business_outreach_settings")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  });
}

export async function POST(req: Request) {
  const body = z
    .object({ business_id: z.string().uuid(), enable: z.boolean().optional() })
    .safeParse(await req.json().catch(() => ({})));

  if (!body.success) {
    return NextResponse.json({ error: "business_id required" }, { status: 400 });
  }

  return withSupabaseRoute(async (sb) => {
    const { data: business, error: bizErr } = await sb
      .from("businesses")
      .select("*")
      .eq("id", body.data.business_id)
      .single();

    if (bizErr || !business) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    const { data: existing } = await sb
      .from("business_outreach_settings")
      .select("*")
      .eq("business_id", business.id)
      .maybeSingle();

    if (existing) {
      if (body.data.enable === true) {
        await sb
          .from("business_outreach_settings")
          .update({ enabled: true, updated_at: new Date().toISOString() })
          .eq("business_id", business.id);
      }
      return NextResponse.json(existing);
    }

    const campaignSlug = slugify(business.name, business.id);
    const website = (business.website_url || "").replace(/\/$/, "");
    const ctaUrl = website
      ? `${website}/?utm_source=outreach&utm_medium=email&utm_campaign=${campaignSlug}&p={prospect_id}`
      : `https://example.com/?p={prospect_id}`;

    const secret = randomBytes(24).toString("hex");
    const { data: created, error } = await sb
      .from("business_outreach_settings")
      .insert({
        business_id: business.id,
        enabled: body.data.enable ?? false,
        campaign_slug: campaignSlug,
        sender_from_name: business.name,
        cta_url_template: ctaUrl,
        cta_label: business.type === "b2b_saas" ? "Start free trial" : "Book now",
        accent_color: "#2563EB",
        trust_badges: [],
        conversion_webhook_secret: secret,
      })
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(created, { status: 201 });
  });
}

export async function PATCH(req: Request) {
  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  }

  return withSupabaseRoute(async (sb) => {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (parsed.data.enabled !== undefined) updates.enabled = parsed.data.enabled;
    if (parsed.data.cta_url_template) updates.cta_url_template = parsed.data.cta_url_template;
    if (parsed.data.cta_label) updates.cta_label = parsed.data.cta_label;
    if (parsed.data.accent_color) updates.accent_color = parsed.data.accent_color;
    if (parsed.data.regenerate_secret) {
      updates.conversion_webhook_secret = randomBytes(24).toString("hex");
    }

    const { data, error } = await sb
      .from("business_outreach_settings")
      .update(updates)
      .eq("business_id", parsed.data.business_id)
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  });
}
