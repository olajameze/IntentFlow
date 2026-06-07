/** Fixed follow-up cadence: Day 3, 7, 14 from initial send. */
export const FOLLOW_UP_OFFSETS_DAYS = [3, 7, 14] as const;

export const MAX_FOLLOWUPS = FOLLOW_UP_OFFSETS_DAYS.length;

export function nextFollowUpAt(sentAtIso: string, followupCountAfterSend: number): string | null {
  if (followupCountAfterSend >= MAX_FOLLOWUPS) return null;
  const days = FOLLOW_UP_OFFSETS_DAYS[followupCountAfterSend];
  if (days === undefined) return null;
  const base = new Date(sentAtIso);
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

/** Hot leads may receive the next touch 1 day earlier than the fixed cadence. */
export function followUpOffsetDays(followupCount: number, tier: "cold" | "warm" | "hot" = "cold"): number {
  const base = FOLLOW_UP_OFFSETS_DAYS[followupCount] ?? 0;
  if (tier === "hot" && base > 1) return base - 1;
  return base;
}

export function isFollowUpDue(
  sentAtIso: string,
  followupCount: number,
  now = new Date(),
  tier: "cold" | "warm" | "hot" = "cold",
): boolean {
  if (followupCount >= MAX_FOLLOWUPS) return false;
  const days = followUpOffsetDays(followupCount, tier);
  if (days <= 0) return false;
  const due = new Date(new Date(sentAtIso).getTime() + days * 24 * 60 * 60 * 1000);
  return now >= due;
}
