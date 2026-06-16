import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkSuppressionBeforeSend } from "./suppression";

type Row = { reason: string; campaign: string | null };

function mockSb(rows: Row[]) {
  return {
    from() {
      return {
        select() {
          return {
            async ilike() {
              return { data: rows };
            },
          };
        },
      };
    },
  } as never;
}

describe("suppression", () => {
  it("blocks global suppression", async () => {
    const sb = mockSb([{ reason: "bounce", campaign: null }]);
    const r = await checkSuppressionBeforeSend(sb, "Test@Example.com", "pesttrace");
    assert.equal(r.blocked, true);
    assert.equal(r.reason, "bounce");
  });

  it("allows when campaign-specific miss", async () => {
    const sb = mockSb([{ reason: "manual", campaign: "weathers" }]);
    const r = await checkSuppressionBeforeSend(sb, "a@b.com", "pesttrace");
    assert.equal(r.blocked, false);
  });

  it("blocks campaign-specific hit", async () => {
    const sb = mockSb([{ reason: "unsubscribe", campaign: "pesttrace" }]);
    const r = await checkSuppressionBeforeSend(sb, "a@b.com", "pesttrace");
    assert.equal(r.blocked, true);
  });
});
