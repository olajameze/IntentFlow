/** Engagement tier scoring for outreach prospects (conversion-focused nurturing). */

export type EngagementTier = "cold" | "warm" | "hot";

export type ProspectEngagementInput = {
  status?: string | null;
  opened_at?: string | null;
  clicked_at?: string | null;
  open_count?: number | null;
  click_count?: number | null;
  booked_at?: string | null;
};

const HOT_CLICK_DAYS = 7;

export function computeEngagementTier(
  prospect: ProspectEngagementInput,
  now: Date = new Date(),
): EngagementTier {
  if (prospect.booked_at) return "hot";

  const clickCount = prospect.click_count ?? 0;
  const clickedAt = prospect.clicked_at ? new Date(prospect.clicked_at) : null;
  const openedAt = prospect.opened_at ? new Date(prospect.opened_at) : null;

  if (clickCount >= 2) return "hot";

  if (clickedAt) {
    const daysSinceClick = (now.getTime() - clickedAt.getTime()) / (24 * 60 * 60 * 1000);
    if (daysSinceClick <= HOT_CLICK_DAYS) return "hot";
    if (openedAt || clickCount >= 1) return "warm";
  }

  if (openedAt || (prospect.open_count ?? 0) > 0) return "warm";

  return "cold";
}

export function engagementUpdateFields(
  prospect: ProspectEngagementInput,
  now: Date = new Date(),
): { engagement_tier: EngagementTier; last_engagement_at: string } {
  return {
    engagement_tier: computeEngagementTier(prospect, now),
    last_engagement_at: now.toISOString(),
  };
}

/** Days until next follow-up based on engagement tier and touch index. */
export function followUpGapDays(tier: EngagementTier, followupCount: number): number {
  if (followupCount >= 2) return 0;
  if (tier === "hot") return 1;
  if (tier === "warm") return 3;
  return 4;
}
