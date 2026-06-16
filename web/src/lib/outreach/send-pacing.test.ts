import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isSmartSendEnabled } from "./send-pacing";

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
