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

function isAuthorized(req: Request): boolean {
  const cron = process.env.CRON_SECRET?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  return (cron && token === cron) || (serviceKey && token === serviceKey) || false;
}

/** GET — list outbound webhook subscriptions. */
export async function GET(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return withSupabaseRoute(async (sb) => {
    const { data, error } = await sb.from("outreach_webhook_subscriptions").select("id, url, campaign, events, enabled, created_at");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  });
}

/** POST — create subscription. */
export async function POST(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

export const dynamic = "force-dynamic";
