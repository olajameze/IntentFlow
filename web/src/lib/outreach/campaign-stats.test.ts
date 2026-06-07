import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { enrichStats } from "./campaign-stats";

describe("campaign-stats enrichStats", () => {
  it("computes delivery_rate and funnel rates from RPC row", () => {
    const stats = enrichStats(
      {
        sent: 100,
        opened: 50,
        clicked: 10,
        replied: 5,
        booked: 2,
        delivered: 90,
        bounced: 3,
        verify_failed: 1,
        inbox_pending: 10,
        engagement: { hot: 4, warm: 6, cold: 90 },
        ab_test: {
          variant_a_sent: 60,
          variant_a_replies: 3,
          variant_b_sent: 40,
          variant_b_replies: 2,
        },
      },
      "pesttrace",
    );

    assert.equal(stats.delivery_rate, 0.9);
    assert.equal(stats.open_rate, 0.5);
    assert.equal(stats.reply_rate, 0.05);
    assert.equal(stats.verify_failed, 1);
    assert.equal(stats.inbox_pending, 10);
    assert.equal(stats.ab_test.variant_a_reply_rate, 0.05);
  });
});
