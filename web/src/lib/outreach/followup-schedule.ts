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

export function isFollowUpDue(sentAtIso: string, followupCount: number, now = new Date()): boolean {
  if (followupCount >= MAX_FOLLOWUPS) return false;
  const days = FOLLOW_UP_OFFSETS_DAYS[followupCount];
  if (days === undefined) return false;
  const due = new Date(new Date(sentAtIso).getTime() + days * 24 * 60 * 60 * 1000);
  return now >= due;
}
