import { computeEngagementTier, followUpGapDays } from "@/lib/outreach/engagement";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const now = new Date("2026-06-04T12:00:00Z");

assert(computeEngagementTier({ clicked_at: now.toISOString(), click_count: 1 }, now) === "hot", "recent click is hot");
assert(computeEngagementTier({ click_count: 2 }, now) === "hot", "2+ clicks is hot");
assert(computeEngagementTier({ opened_at: now.toISOString() }, now) === "warm", "open only is warm");
assert(computeEngagementTier({}, now) === "cold", "no engagement is cold");
assert(followUpGapDays("hot", 0) === 1, "hot tier accelerates follow-up");
assert(followUpGapDays("cold", 0) === 4, "cold tier standard gap");

console.log("engagement.test.ts: all assertions passed");
