import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isUnsubscribeReply } from "./reply-handler";

describe("reply-handler", () => {
  it("detects STOP and unsubscribe keywords", () => {
    assert.equal(isUnsubscribeReply("Please STOP emailing me"), true);
    assert.equal(isUnsubscribeReply("unsubscribe"), true);
    assert.equal(isUnsubscribeReply("OPT OUT thanks"), true);
    assert.equal(isUnsubscribeReply("Sounds interesting — call me Tuesday"), false);
  });
});
