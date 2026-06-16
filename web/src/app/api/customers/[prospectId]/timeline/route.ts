import { NextResponse } from "next/server";
import { withSupabaseRoute } from "@/lib/with-supabase-route";

type Params = { params: { prospectId: string } };

/** GET unified customer timeline */
export async function GET(_req: Request, { params }: Params) {
  const prospectId = params.prospectId?.trim();
  if (!prospectId) return NextResponse.json({ error: "prospectId required" }, { status: 400 });

  return withSupabaseRoute(async (sb) => {
    const { data: prospect } = await sb
      .from("outreach_prospects")
      .select("*")
      .eq("id", prospectId)
      .maybeSingle();
    if (!prospect) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const [messages, events, conversions, timeline, revenue] = await Promise.all([
      sb.from("outreach_messages").select("*").eq("prospect_id", prospectId).order("occurred_at"),
      sb.from("outreach_email_events").select("*").eq("prospect_id", prospectId).order("occurred_at"),
      sb.from("outreach_conversion_receipts").select("*").eq("prospect_id", prospectId).order("occurred_at"),
      sb.from("customer_timeline_events").select("*").eq("prospect_id", prospectId).order("occurred_at"),
      prospect.email
        ? sb.from("revenue_entries").select("*").order("entry_date", { ascending: false }).limit(20)
        : Promise.resolve({ data: [] }),
    ]);

    const merged = [
      ...(messages.data ?? []).map((m) => ({
        type: "message",
        title: `${m.direction}: ${m.subject || "—"}`,
        occurred_at: m.occurred_at,
        detail: m,
      })),
      ...(events.data ?? []).map((e) => ({
        type: "email_event",
        title: e.event_type,
        occurred_at: e.occurred_at,
        detail: e,
      })),
      ...(conversions.data ?? []).map((c) => ({
        type: "conversion",
        title: c.event_type,
        occurred_at: c.occurred_at,
        detail: c,
      })),
      ...(timeline.data ?? []).map((t) => ({
        type: t.event_type,
        title: t.title,
        occurred_at: t.occurred_at,
        detail: t.detail,
      })),
    ].sort((a, b) => String(a.occurred_at).localeCompare(String(b.occurred_at)));

    return NextResponse.json({ prospect, events: merged, revenue: revenue.data ?? [] });
  });
}

export const dynamic = "force-dynamic";
