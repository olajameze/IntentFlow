import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FOLLOW_UP_OFFSETS_DAYS,
  followUpOffsetDays,
  isFollowUpDue,
  MAX_FOLLOWUPS,
  nextFollowUpAt,
} from "./followup-schedule";

describe("followup-schedule", () => {
  it("schedules day 3/7/14 offsets", () => {
    assert.equal(FOLLOW_UP_OFFSETS_DAYS.join(","), "3,7,14");
    assert.equal(MAX_FOLLOWUPS, 3);
    const sent = "2026-01-01T12:00:00.000Z";
    assert.equal(nextFollowUpAt(sent, 0)?.slice(0, 10), "2026-01-04");
    assert.equal(nextFollowUpAt(sent, 1)?.slice(0, 10), "2026-01-08");
    assert.equal(nextFollowUpAt(sent, 2)?.slice(0, 10), "2026-01-15");
    assert.equal(nextFollowUpAt(sent, 3), null);
  });

  it("accelerates hot leads by one day", () => {
    assert.equal(followUpOffsetDays(0, "hot"), 2);
    assert.equal(followUpOffsetDays(0, "cold"), 3);
    const sent = "2026-01-01T12:00:00.000Z";
    const dueHot = new Date("2026-01-03T13:00:00.000Z");
    const dueEarlyCold = new Date("2026-01-03T13:00:00.000Z");
    assert.equal(isFollowUpDue(sent, 0, dueHot, "hot"), true);
    assert.equal(isFollowUpDue(sent, 0, dueEarlyCold, "cold"), false);
  });
});
