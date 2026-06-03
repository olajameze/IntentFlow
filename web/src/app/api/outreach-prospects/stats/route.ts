import { NextResponse } from "next/server";
import { supabaseErrorResponse } from "@/lib/supabase-error-response";
import { withSupabaseRoute } from "@/lib/with-supabase-route";

/** GET /api/outreach-prospects/stats?campaign=pesttrace */
export async function GET(req: Request) {
  return withSupabaseRoute(async (sb) => {
    const { searchParams } = new URL(req.url);
    const campaign = (searchParams.get("campaign") || "pesttrace").trim().toLowerCase();

    const { data: prospects, error } = await sb
      .from("outreach_prospects")
      .select(
        "id, status, opened_at, clicked_at, replied_at, booked_at, subject_variant, engagement_tier",
      )
      .eq("campaign", campaign);

    if (error) return supabaseErrorResponse(error);

    const rows = prospects ?? [];
    const sent = rows.filter((r) => r.status === "sent" || r.replied_at || r.booked_at).length;
    const opened = rows.filter((r) => r.opened_at).length;
    const clicked = rows.filter((r) => r.clicked_at).length;
    const replied = rows.filter((r) => r.replied_at).length;
    const booked = rows.filter((r) => r.booked_at).length;
    const bounced = rows.filter((r) => r.status === "bounced").length;
    const hotLeads = rows.filter(
      (r) => r.engagement_tier === "hot" && !r.booked_at && r.status === "sent",
    ).length;

    const variantA = rows.filter((r) => r.subject_variant === "A");
    const variantB = rows.filter((r) => r.subject_variant === "B");
    const variantAReplies = variantA.filter((r) => r.replied_at).length;
    const variantBReplies = variantB.filter((r) => r.replied_at).length;

    const ids = rows.map((r) => r.id);
    let revenueCount = 0;
    if (ids.length) {
      const { count } = await sb
        .from("outreach_conversion_receipts")
        .select("id", { count: "exact", head: true })
        .in("prospect_id", ids)
        .in("event_type", ["payment_completed", "trial_started", "deposit_paid"]);
      revenueCount = count ?? 0;
    }

    return NextResponse.json({
      campaign,
      sent,
      opened,
      clicked,
      replied,
      booked,
      bounced,
      hot_leads: hotLeads,
      revenue_attributed: revenueCount,
      engagement: {
        hot: rows.filter((r) => r.engagement_tier === "hot").length,
        warm: rows.filter((r) => r.engagement_tier === "warm").length,
        cold: rows.filter((r) => r.engagement_tier === "cold").length,
      },
      open_rate: sent > 0 ? opened / sent : 0,
      click_rate: sent > 0 ? clicked / sent : 0,
      reply_rate: sent > 0 ? replied / sent : 0,
      booking_rate: sent > 0 ? booked / sent : 0,
      bounce_rate: sent > 0 ? bounced / sent : 0,
      ctr_to_reply: clicked > 0 ? replied / clicked : 0,
      ab_test: {
        variant_a_sent: variantA.length,
        variant_a_replies: variantAReplies,
        variant_a_reply_rate: variantA.length > 0 ? variantAReplies / variantA.length : 0,
        variant_b_sent: variantB.length,
        variant_b_replies: variantBReplies,
        variant_b_reply_rate: variantB.length > 0 ? variantBReplies / variantB.length : 0,
      },
    });
  });
}
