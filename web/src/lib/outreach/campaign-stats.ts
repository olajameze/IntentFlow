import { unstable_cache, revalidateTag } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export type CampaignStatsPayload = {
  campaign: string;
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  booked: number;
  delivered: number;
  interested: number;
  meeting_booked: number;
  converted: number;
  bounced: number;
  hot_leads: number;
  revenue_attributed: number;
  verify_failed: number;
  inbox_pending: number;
  delivery_rate: number;
  engagement: { hot: number; warm: number; cold: number };
  open_rate: number;
  click_rate: number;
  reply_rate: number;
  booking_rate: number;
  bounce_rate: number;
  ctr_to_reply: number;
  ab_test: {
    variant_a_sent: number;
    variant_a_replies: number;
    variant_a_reply_rate: number;
    variant_b_sent: number;
    variant_b_replies: number;
    variant_b_reply_rate: number;
  };
};

export function outreachStatsTag(campaign: string): string {
  return `outreach-stats-${campaign.trim().toLowerCase()}`;
}

export function invalidateOutreachStats(campaign: string): void {
  revalidateTag(outreachStatsTag(campaign));
}

type RpcRow = {
  campaign?: string;
  sent?: number;
  opened?: number;
  clicked?: number;
  replied?: number;
  booked?: number;
  delivered?: number;
  interested?: number;
  meeting_booked?: number;
  converted?: number;
  bounced?: number;
  hot_leads?: number;
  revenue_attributed?: number;
  verify_failed?: number;
  inbox_pending?: number;
  engagement?: { hot?: number; warm?: number; cold?: number };
  ab_test?: {
    variant_a_sent?: number;
    variant_a_replies?: number;
    variant_b_sent?: number;
    variant_b_replies?: number;
  };
};

export function enrichStats(raw: RpcRow, campaign: string): CampaignStatsPayload {
  const sent = Number(raw.sent ?? 0);
  const opened = Number(raw.opened ?? 0);
  const clicked = Number(raw.clicked ?? 0);
  const replied = Number(raw.replied ?? 0);
  const booked = Number(raw.booked ?? 0);
  const delivered = Number(raw.delivered ?? 0);
  const bounced = Number(raw.bounced ?? 0);
  const ab = raw.ab_test ?? {};
  const variantASent = Number(ab.variant_a_sent ?? 0);
  const variantAReplies = Number(ab.variant_a_replies ?? 0);
  const variantBSent = Number(ab.variant_b_sent ?? 0);
  const variantBReplies = Number(ab.variant_b_replies ?? 0);
  const engagement = raw.engagement ?? {};

  return {
    campaign: raw.campaign ?? campaign,
    sent,
    opened,
    clicked,
    replied,
    booked,
    delivered,
    interested: Number(raw.interested ?? 0),
    meeting_booked: Number(raw.meeting_booked ?? 0),
    converted: Number(raw.converted ?? 0),
    bounced,
    hot_leads: Number(raw.hot_leads ?? 0),
    revenue_attributed: Number(raw.revenue_attributed ?? 0),
    verify_failed: Number(raw.verify_failed ?? 0),
    inbox_pending: Number(raw.inbox_pending ?? 0),
    delivery_rate: sent > 0 ? delivered / sent : 0,
    engagement: {
      hot: Number(engagement.hot ?? 0),
      warm: Number(engagement.warm ?? 0),
      cold: Number(engagement.cold ?? 0),
    },
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
  };
}

async function fetchCampaignStatsFromDb(campaign: string): Promise<CampaignStatsPayload> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.rpc("outreach_campaign_stats", { p_campaign: campaign });
  if (error) {
    const { fetchCampaignStatsFallback, isStatsRpcMissingError } = await import(
      "@/lib/outreach/campaign-stats-fallback"
    );
    if (isStatsRpcMissingError(error)) {
      return fetchCampaignStatsFallback(sb, campaign);
    }
    throw error;
  }
  return enrichStats((data ?? {}) as RpcRow, campaign);
}

/** Cached campaign stats — one RPC, 30s revalidate, tag invalidation on send/webhook. */
export function getCachedCampaignStats(campaign: string): Promise<CampaignStatsPayload> {
  const key = campaign.trim().toLowerCase();
  return unstable_cache(() => fetchCampaignStatsFromDb(key), [`outreach-campaign-stats`, key], {
    revalidate: 30,
    tags: [outreachStatsTag(key)],
  })();
}
