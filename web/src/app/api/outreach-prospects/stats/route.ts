import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseErrorResponse } from "@/lib/supabase-error-response";
import { withSupabaseRoute } from "@/lib/with-supabase-route";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FilterQuery = any;

async function countProspects(
  sb: SupabaseClient,
  campaign: string,
  apply: (q: FilterQuery) => FilterQuery,
): Promise<number> {
  const q = apply(
    sb
      .from("outreach_prospects")
      .select("id", { count: "exact", head: true })
      .eq("campaign", campaign),
  );
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

/** GET /api/outreach-prospects/stats?campaign=pesttrace */
export async function GET(req: Request) {
  return withSupabaseRoute(async (sb) => {
    const { searchParams } = new URL(req.url);
    const campaign = (searchParams.get("campaign") || "pesttrace").trim().toLowerCase();

    try {
      const [
        sent,
        opened,
        clicked,
        replied,
        booked,
        delivered,
        interested,
        meeting_booked,
        converted,
        bounced,
        hotLeads,
        hotTier,
        warmTier,
        coldTier,
        variantASent,
        variantBSent,
        variantAReplies,
        variantBReplies,
        revenueRes,
      ] = await Promise.all([
        countProspects(sb, campaign, (q) =>
          q.or("status.eq.sent,replied_at.not.is.null,booked_at.not.is.null"),
        ),
        countProspects(sb, campaign, (q) => q.not("opened_at", "is", null)),
        countProspects(sb, campaign, (q) => q.not("clicked_at", "is", null)),
        countProspects(sb, campaign, (q) => q.not("replied_at", "is", null)),
        countProspects(sb, campaign, (q) => q.not("booked_at", "is", null)),
        countProspects(sb, campaign, (q) => q.not("delivered_at", "is", null)),
        countProspects(sb, campaign, (q) => q.not("interested_at", "is", null)),
        countProspects(sb, campaign, (q) => q.not("meeting_booked_at", "is", null)),
        countProspects(sb, campaign, (q) => q.not("converted_at", "is", null)),
        countProspects(sb, campaign, (q) => q.eq("status", "bounced")),
        countProspects(sb, campaign, (q) =>
          q.eq("engagement_tier", "hot").eq("status", "sent").is("booked_at", null),
        ),
        countProspects(sb, campaign, (q) => q.eq("engagement_tier", "hot")),
        countProspects(sb, campaign, (q) => q.eq("engagement_tier", "warm")),
        countProspects(sb, campaign, (q) => q.eq("engagement_tier", "cold")),
        countProspects(sb, campaign, (q) =>
          q.or("subject_variant.eq.A,subject_variant.is.null"),
        ),
        countProspects(sb, campaign, (q) => q.eq("subject_variant", "B")),
        countProspects(sb, campaign, (q) =>
          q.or(
            "and(subject_variant.eq.A,replied_at.not.is.null),and(subject_variant.is.null,replied_at.not.is.null)",
          ),
        ),
        countProspects(sb, campaign, (q) =>
          q.eq("subject_variant", "B").not("replied_at", "is", null),
        ),
        sb
          .from("outreach_conversion_receipts")
          .select("id, outreach_prospects!inner(campaign)", { count: "exact", head: true })
          .eq("outreach_prospects.campaign", campaign)
          .in("event_type", ["payment_completed", "trial_started", "deposit_paid"]),
      ]);

      if (revenueRes.error) return supabaseErrorResponse(revenueRes.error);

      const revenueCount = revenueRes.count ?? 0;

      return NextResponse.json(
        {
          campaign,
          sent,
          opened,
          clicked,
          replied,
          booked,
          delivered,
          interested,
          meeting_booked,
          converted,
          bounced,
          hot_leads: hotLeads,
          revenue_attributed: revenueCount,
          engagement: { hot: hotTier, warm: warmTier, cold: coldTier },
          open_rate: sent > 0 ? opened / sent : 0,
          click_rate: sent > 0 ? clicked / sent : 0,
          reply_rate: sent > 0 ? replied / sent : 0,
          booking_rate: sent > 0 ? booked / sent : 0,
          bounce_rate: sent > 0 ? bounced / sent : 0,
          ctr_to_reply: clicked > 0 ? replied / clicked : 0,
          ab_test: {
            variant_a_sent: variantASent,
            variant_a_replies: variantAReplies,
            variant_a_reply_rate: variantASent > 0 ? variantAReplies / variantASent : 0,
            variant_b_sent: variantBSent,
            variant_b_replies: variantBReplies,
            variant_b_reply_rate: variantBSent > 0 ? variantBReplies / variantBSent : 0,
          },
        },
        {
          headers: {
            "Cache-Control": "private, max-age=15, stale-while-revalidate=30",
          },
        },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Stats query failed";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}
