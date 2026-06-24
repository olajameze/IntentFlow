import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { countSendsInWindow, isSmartSendEnabled } from "./send-pacing";

describe("countSendsInWindow", () => {
  it("counts sent and bounced prospects with sent_at in the rolling window", async () => {
    const filters: string[] = [];
    const sb = {
      from: () => ({
        select: () => ({
          eq: (_col: string, _val: string) => ({
            in: (col: string, values: string[]) => {
              filters.push(`${col}=${values.join("|")}`);
              return {
                gte: async () => ({ count: 7, error: null }),
              };
            },
          }),
        }),
      }),
    } as unknown as SupabaseClient;

    const count = await countSendsInWindow(sb, "pesttrace");
    assert.equal(count, 7);
    assert.equal(filters.at(-1), "status=sent|bounced");
  });
});

describe("send-pacing smart send", () => {
  it("isSmartSendEnabled respects OUTREACH_SMART_SEND", () => {
    const prev = process.env.OUTREACH_SMART_SEND;
    process.env.OUTREACH_SMART_SEND = "1";
    assert.equal(isSmartSendEnabled(), true);
    process.env.OUTREACH_SMART_SEND = "0";
    assert.equal(isSmartSendEnabled(), false);
    if (prev === undefined) delete process.env.OUTREACH_SMART_SEND;
    else process.env.OUTREACH_SMART_SEND = prev;
  });
});
