import { NextResponse } from "next/server";
import { withSupabaseRoute } from "@/lib/with-supabase-route";

/** GET /api/outreach-inbox?campaign=&filter=needs_reply|hot|all&limit=50 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const campaign = searchParams.get("campaign")?.trim().toLowerCase();
  const filter = searchParams.get("filter") || "needs_reply";
  const limit = Math.min(Number(searchParams.get("limit") || 50), 100);

  return withSupabaseRoute(async (sb) => {
    let q = sb
      .from("outreach_prospects")
      .select(
        "id, name, email, campaign, status, engagement_tier, replied_at, booked_at, sent_at, lead_score, updated_at",
      )
      .eq("status", "sent")
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (campaign && campaign !== "all") q = q.eq("campaign", campaign);
    if (filter === "needs_reply") q = q.not("replied_at", "is", null).is("booked_at", null);
    else if (filter === "hot") q = q.eq("engagement_tier", "hot").is("booked_at", null);
    else if (filter === "unreplied_hot") q = q.eq("engagement_tier", "hot").is("replied_at", null);
    // filter === "all" — all sent prospects, no extra predicates

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const ids = (data ?? []).map((p) => p.id);
    const previews: Record<string, string> = {};
    if (ids.length) {
      const { data: msgs } = await sb
        .from("outreach_messages")
        .select("prospect_id, body_text, occurred_at")
        .in("prospect_id", ids)
        .order("occurred_at", { ascending: false });
      for (const m of msgs ?? []) {
        if (!previews[m.prospect_id]) {
          previews[m.prospect_id] = String(m.body_text ?? "").slice(0, 160);
        }
      }
    }

    return NextResponse.json(
      (data ?? []).map((p) => ({
        ...p,
        preview: previews[p.id] ?? null,
      })),
    );
  });
}

export const dynamic = "force-dynamic";
