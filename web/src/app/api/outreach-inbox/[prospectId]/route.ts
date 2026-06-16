import { NextResponse } from "next/server";
import { withSupabaseRoute } from "@/lib/with-supabase-route";
import { WEATHERS_BUSINESS_ID } from "@/lib/revenue-setup";

type Params = { params: { prospectId: string } };

/** GET thread + prospect context */
export async function GET(_req: Request, { params }: Params) {
  const prospectId = params.prospectId?.trim();
  if (!prospectId) return NextResponse.json({ error: "prospectId required" }, { status: 400 });

  return withSupabaseRoute(async (sb) => {
    const { data: prospect, error } = await sb
      .from("outreach_prospects")
      .select("*")
      .eq("id", prospectId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!prospect) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { data: messages } = await sb
      .from("outreach_messages")
      .select("*")
      .eq("prospect_id", prospectId)
      .order("occurred_at", { ascending: true });

    const { data: snapshot } = await sb
      .from("outreach_snapshots")
      .select("token, campaign, overall_score")
      .eq("prospect_id", prospectId)
      .maybeSingle();

    const { data: timeline } = await sb
      .from("customer_timeline_events")
      .select("*")
      .eq("prospect_id", prospectId)
      .order("occurred_at", { ascending: false })
      .limit(20);

    return NextResponse.json({ prospect, messages: messages ?? [], snapshot, timeline: timeline ?? [] });
  });
}

/** PATCH — mark interested / not_a_fit / booked / pause */
export async function PATCH(req: Request, { params }: Params) {
  const prospectId = params.prospectId?.trim();
  if (!prospectId) return NextResponse.json({ error: "prospectId required" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action || "");

  return withSupabaseRoute(async (sb) => {
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updated_at: now };

    if (action === "interested") updates.interested_at = now;
    else if (action === "not_a_fit") {
      updates.status = "rejected";
      updates.next_send_at = null;
    } else if (action === "pause") updates.next_send_at = null;
    else if (action === "booked") updates.booked_at = now;
    else if (action === "log_job") {
      const amount = Number(body.amount ?? 0);
      if (amount > 0) {
        await sb.from("revenue_entries").insert({
          business_id: WEATHERS_BUSINESS_ID,
          amount,
          currency: String(body.currency || "GBP"),
          source: "manual",
          description: String(body.description || "Job completed via inbox"),
          entry_date: new Date().toISOString().slice(0, 10),
        });
      }
      updates.booked_at = now;
      updates.converted_at = now;
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    const { data, error } = await sb
      .from("outreach_prospects")
      .update(updates)
      .eq("id", prospectId)
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  });
}

export const dynamic = "force-dynamic";
