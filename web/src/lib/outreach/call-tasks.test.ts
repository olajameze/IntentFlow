import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatCallScriptForCopy } from "./llm-call-prep";
import { hasCallIntent } from "./call-tasks";

describe("hasCallIntent", () => {
  it("detects phone-related replies", () => {
    assert.equal(hasCallIntent("Can you call me tomorrow?"), true);
    assert.equal(hasCallIntent("Happy to speak next week"), true);
    assert.equal(hasCallIntent("Send more info by email"), false);
  });
});

describe("formatCallScriptForCopy", () => {
  it("formats script sections for clipboard", () => {
    const text = formatCallScriptForCopy({
      opening_script: "Hello there",
      talking_points: ["Point one"],
      objection_handling: [{ objection: "Too busy", response: "No rush" }],
      suggested_next_step: "Send booking link",
    });
    assert.match(text, /Hello there/);
    assert.match(text, /Point one/);
    assert.match(text, /Too busy/);
    assert.match(text, /Send booking link/);
  });
});
