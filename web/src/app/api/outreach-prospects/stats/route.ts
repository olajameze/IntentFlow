import { NextResponse } from "next/server";
import { supabaseErrorResponse } from "@/lib/supabase-error-response";
import { withSupabaseRoute } from "@/lib/with-supabase-route";

const VALID_CAMPAIGNS = ["pesttrace", "weathers"] as const;

/**
 * GET /api/outreach-prospects/stats?campaign=pesttrace
 *
 * Aggregates the Klaviyo step-9 conversion funnel for a campaign:
 *   sent → opened → clicked → replied → booked
 *
 * Plus subject A/B reply rates so the operator can pick winners on the dashboard.
 */
export async function GET(req: Request) {
  return withSupabaseRoute(async (sb) => {
    const { searchParams } = new URL(req.url);
    const raw = (searchParams.get("campaign") || "pesttrace").toLowerCase();
    const campaign = (VALID_CAMPAIGNS as readonly string[]).includes(raw)
      ? raw
      : "pesttrace";

    // One query, many counts — keeps the panel snappy even with thousands of prospects.
    const { data: prospects, error } = await sb
      .from("outreach_prospects")
      .select("status, opened_at, clicked_at, replied_at, booked_at, subject_variant")
      .eq("campaign", campaign);

    if (error) return supabaseErrorResponse(error);

    const rows = prospects ?? [];
    const sent = rows.filter((r) => r.status === "sent" || r.replied_at || r.booked_at).length;
    const opened = rows.filter((r) => r.opened_at).length;
    const clicked = rows.filter((r) => r.clicked_at).length;
    const replied = rows.filter((r) => r.replied_at).length;
    const booked = rows.filter((r) => r.booked_at).length;
    const bounced = rows.filter((r) => r.status === "bounced").length;

    // A/B subject reply rate — only meaningful once we have a few sends per arm.
    const variantA = rows.filter((r) => r.subject_variant === "A");
    const variantB = rows.filter((r) => r.subject_variant === "B");
    const variantAReplies = variantA.filter((r) => r.replied_at).length;
    const variantBReplies = variantB.filter((r) => r.replied_at).length;

    return NextResponse.json({
      campaign,
      sent,
      opened,
      clicked,
      replied,
      booked,
      bounced,
      // Rates as fractions (UI multiplies by 100 for display)
      open_rate: sent > 0 ? opened / sent : 0,
      click_rate: sent > 0 ? clicked / sent : 0,
      reply_rate: sent > 0 ? replied / sent : 0,
      booking_rate: sent > 0 ? booked / sent : 0,
      bounce_rate: sent > 0 ? bounced / sent : 0,
      // Click-to-reply funnel — diagnostic
      ctr_to_reply: clicked > 0 ? replied / clicked : 0,
      // A/B subject test
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
