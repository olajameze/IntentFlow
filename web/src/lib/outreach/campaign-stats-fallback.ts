import type { SupabaseClient } from "@supabase/supabase-js";
import { enrichStats, type CampaignStatsPayload } from "@/lib/outreach/campaign-stats";

function isRpcMissing(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  return (
    lower.includes("outreach_campaign_stats") ||
    lower.includes("could not find the function") ||
    lower.includes("does not exist")
  );
}

async function countWhere(
  sb: SupabaseClient,
  campaign: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filter: (q: any) => any,
): Promise<number> {
  let q = sb.from("outreach_prospects").select("id", { count: "exact", head: true }).eq("campaign", campaign);
  q = filter(q);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

async function countHotLeads(sb: SupabaseClient, campaign: string): Promise<number> {
  try {
    return await countWhere(sb, campaign, (q) =>
      q.eq("engagement_tier", "hot").eq("status", "sent").is("booked_at", null),
    );
  } catch {
    return countWhere(sb, campaign, (q) =>
      q.eq("status", "sent").is("booked_at", null).gt("click_count", 0),
    ).catch(() => 0);
  }
}

async function countEngagementTier(
  sb: SupabaseClient,
  campaign: string,
  tier: "hot" | "warm" | "cold",
): Promise<number> {
  try {
    return await countWhere(sb, campaign, (q) => q.eq("engagement_tier", tier));
  } catch {
    return 0;
  }
}

/** Parallel COUNT fallback when outreach_campaign_stats RPC is not installed. */
export async function fetchCampaignStatsFallback(
  sb: SupabaseClient,
  campaign: string,
): Promise<CampaignStatsPayload> {
  const [
    sent,
    opened,
    clicked,
    replied,
    booked,
    bounced,
    hotLeads,
    hotTier,
    warmTier,
    coldTierRaw,
    variantASent,
    variantBSent,
    variantAReplies,
    variantBReplies,
  ] = await Promise.all([
    countWhere(sb, campaign, (q) =>
      q.or("status.eq.sent,replied_at.not.is.null,booked_at.not.is.null"),
    ),
    countWhere(sb, campaign, (q) => q.not("opened_at", "is", null)),
    countWhere(sb, campaign, (q) => q.not("clicked_at", "is", null)),
    countWhere(sb, campaign, (q) => q.not("replied_at", "is", null)),
    countWhere(sb, campaign, (q) => q.not("booked_at", "is", null)),
    countWhere(sb, campaign, (q) => q.eq("status", "bounced")),
    countHotLeads(sb, campaign),
    countEngagementTier(sb, campaign, "hot"),
    countEngagementTier(sb, campaign, "warm"),
    countEngagementTier(sb, campaign, "cold"),
    countWhere(sb, campaign, (q) => q.or("subject_variant.eq.A,subject_variant.is.null")),
    countWhere(sb, campaign, (q) => q.eq("subject_variant", "B")),
    countWhere(sb, campaign, (q) =>
      q.or("subject_variant.eq.A,subject_variant.is.null").not("replied_at", "is", null),
    ),
    countWhere(sb, campaign, (q) => q.eq("subject_variant", "B").not("replied_at", "is", null)),
  ]);
  const coldTier = coldTierRaw > 0 ? coldTierRaw : sent;

  let delivered = 0;
  let interested = 0;
  let meetingBooked = 0;
  let converted = 0;
  const verifyFailed = 0;
  let inboxPending = 0;
  let revenueAttributed = 0;

  try {
    [delivered, interested, meetingBooked, converted, inboxPending] = await Promise.all([
      countWhere(sb, campaign, (q) => q.not("delivered_at", "is", null)),
      countWhere(sb, campaign, (q) => q.not("interested_at", "is", null)),
      countWhere(sb, campaign, (q) => q.not("meeting_booked_at", "is", null)),
      countWhere(sb, campaign, (q) => q.not("converted_at", "is", null)),
      countWhere(sb, campaign, (q) => q.eq("status", "sent").is("delivered_at", null)),
    ]);
  } catch {
    inboxPending = Math.max(0, sent - delivered);
  }

  try {
    const { count } = await sb
      .from("outreach_conversion_receipts")
      .select("id", { count: "exact", head: true })
      .in("event_type", ["payment_completed", "trial_started", "deposit_paid"]);
    revenueAttributed = count ?? 0;
  } catch {
    revenueAttributed = 0;
  }

  return enrichStats(
    {
      campaign,
      sent,
      opened,
      clicked,
      replied,
      booked,
      delivered,
      interested,
      meeting_booked: meetingBooked,
      converted,
      bounced,
      hot_leads: hotLeads,
      verify_failed: verifyFailed,
      inbox_pending: inboxPending,
      revenue_attributed: revenueAttributed,
      engagement: { hot: hotTier, warm: warmTier, cold: coldTier },
      ab_test: {
        variant_a_sent: variantASent,
        variant_a_replies: variantAReplies,
        variant_b_sent: variantBSent,
        variant_b_replies: variantBReplies,
      },
    },
    campaign,
  );
}

export function isStatsRpcMissingError(err: unknown): boolean {
  return isRpcMissing(err);
}
