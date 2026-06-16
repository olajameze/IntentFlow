import { NextResponse } from "next/server";
import { withSupabaseRoute } from "@/lib/with-supabase-route";

/** GET/POST/PATCH outreach alert rules */
export async function GET() {
  return withSupabaseRoute(async (sb) => {
    const { data, error } = await sb.from("outreach_alert_rules").select("*").order("created_at");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  });
}

export async function POST(req: Request) {
  const body = await req.json();
  return withSupabaseRoute(async (sb) => {
    const { data, error } = await sb
      .from("outreach_alert_rules")
      .insert({
        campaign: body.campaign ?? "all",
        events: body.events ?? ["reply", "hot_lead"],
        to_emails: body.to_emails ?? [],
        enabled: body.enabled ?? true,
      })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  });
}

export async function PATCH(req: Request) {
  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  return withSupabaseRoute(async (sb) => {
    const { data, error } = await sb
      .from("outreach_alert_rules")
      .update({
        campaign: body.campaign,
        events: body.events,
        to_emails: body.to_emails,
        enabled: body.enabled,
        updated_at: new Date().toISOString(),
      })
      .eq("id", body.id)
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  });
}

export const dynamic = "force-dynamic";
