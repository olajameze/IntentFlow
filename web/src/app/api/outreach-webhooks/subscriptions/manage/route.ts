import { NextResponse } from "next/server";
import { z } from "zod";
import { withSupabaseRoute } from "@/lib/with-supabase-route";

const createSchema = z.object({
  url: z.string().url(),
  secret: z.string().min(16),
  campaign: z.string().default("all"),
  events: z
    .array(z.enum(["reply", "booked", "converted", "hot_lead", "unsubscribe", "interested", "meeting_booked"]))
    .default(["reply", "booked", "converted", "hot_lead"]),
});

const patchSchema = z.object({
  id: z.string().uuid(),
  enabled: z.boolean(),
});

/** Dashboard proxy — uses service role server-side; no CRON_SECRET in browser. */
export async function GET() {
  return withSupabaseRoute(async (sb) => {
    const { data, error } = await sb
      .from("outreach_webhook_subscriptions")
      .select("id, url, campaign, events, enabled, created_at")
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  });
}

export async function POST(req: Request) {
  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  return withSupabaseRoute(async (sb) => {
    const { data, error } = await sb
      .from("outreach_webhook_subscriptions")
      .insert({
        url: parsed.data.url,
        secret: parsed.data.secret,
        campaign: parsed.data.campaign,
        events: parsed.data.events,
        enabled: true,
      })
      .select("id, url, campaign, events, enabled")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, subscription: data });
  });
}

export async function PATCH(req: Request) {
  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  return withSupabaseRoute(async (sb) => {
    const { data, error } = await sb
      .from("outreach_webhook_subscriptions")
      .update({ enabled: parsed.data.enabled })
      .eq("id", parsed.data.id)
      .select("id, url, campaign, events, enabled")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, subscription: data });
  });
}

export const dynamic = "force-dynamic";
