import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  validateOutreachCopy,
  plainTextFromHtml,
  normalizeOutreachBody,
} from "./email-validator";

describe("validateOutreachCopy", () => {
  const cleanSubject = "Audit readiness for your pest control operation";
  const cleanBody =
    "Hi Acme Pest,\n\nMany operators in your sector struggle with inspection paperwork when regulators visit. PestTrace keeps treatment logs and certificates in one place.\n\nWould a short call next week be useful?\n\nBest,\nThe PestTrace Team";

  it("accepts clean professional copy", () => {
    const result = validateOutreachCopy(cleanSubject, cleanBody, "initial");
    assert.equal(result.ok, true);
    assert.equal(result.issues.length, 0);
  });

  it("rejects AI assistant preamble phrases", () => {
    const result = validateOutreachCopy(
      "Quick question",
      "Here is the professional outreach email for your review.\n\nHi there...",
      "initial",
    );
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((i) => i.includes("here is")));
  });

  it("rejects below is and certainly", () => {
    const r1 = validateOutreachCopy("Subject", "Below is a draft for your team.", "initial");
    assert.equal(r1.ok, false);

    const r2 = validateOutreachCopy("Subject", "Certainly, I can help with compliance.", "initial");
    assert.equal(r2.ok, false);
  });

  it("rejects markdown and JSON leakage", () => {
    const md = validateOutreachCopy("Sub", "**Bold** claim about services.", "initial");
    assert.equal(md.ok, false);

    const json = validateOutreachCopy("Sub", '{"subject":"Hi","body":"Hello"}', "initial");
    assert.equal(json.ok, false);
  });

  it("rejects draft placeholders", () => {
    const result = validateOutreachCopy("Sub", "[Draft — configure LLM fallback]", "initial");
    assert.equal(result.ok, false);
  });

  it("enforces follow-up word limit", () => {
    const longBody = Array(100).fill("word").join(" ");
    const result = validateOutreachCopy("Follow up", longBody, "followup");
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((i) => i.includes("word limit")));
  });
});

describe("plainTextFromHtml", () => {
  it("strips HTML tags", () => {
    const plain = plainTextFromHtml("<p>Hello <strong>world</strong></p>");
    assert.ok(plain.includes("Hello"));
    assert.ok(!plain.includes("<"));
  });
});

describe("normalizeOutreachBody", () => {
  it("collapses triple newlines", () => {
    assert.equal(normalizeOutreachBody("a\n\n\n\nb"), "a\n\nb");
  });
});
