import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  validateOutreachCopy,
  plainTextFromHtml,
  messagePlainTextFromHtml,
  normalizeOutreachBody,
  stripAiMetaFromHtml,
  stripAiMetaPreamble,
} from "./email-validator";
import { validateEmailForSend } from "./send-validation";

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
    assert.ok(
      result.issues.some(
        (i) => i.includes("here is") || i.includes("professional outreach email"),
      ),
    );
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
    const longBody = Array(101).fill("word").join(" ");
    const result = validateOutreachCopy("Follow up", longBody, "followup");
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((i) => i.includes("word limit")));
  });

  it("allows natural phrasing later in the body", () => {
    const body =
      "We put together a site score snapshot for your team.\n\n" +
      "We can certainly help if local SEO is a priority. Let me know if the gaps look familiar.\n\n" +
      "Best regards,\nThe JGDevs Team";
    const result = validateOutreachCopy("Site score for Acme?", body, "initial");
    assert.equal(result.ok, true);
  });

  it("allows free trial mention in message copy", () => {
    const body =
      "If the gaps look familiar, PestTrace offers a 7-day free trial for audit-ready logbooks.\n\n" +
      "Best regards,\nThe PestTrace Team";
    const result = validateOutreachCopy("Audit snapshot for Acme?", body, "initial");
    assert.equal(result.ok, true);
  });

  it("allows compliance acronyms in body copy", () => {
    const body =
      "Operators in your market often face BRCGS and HACCP documentation expectations.\n\n" +
      "PestTrace keeps treatment logs audit-ready.\n\nBest regards,\nThe PestTrace Team";
    const result = validateOutreachCopy("Audit snapshot for Acme?", body, "initial");
    assert.equal(result.ok, true);
  });

  it("allows short acronyms and unsubscribe STOP in HTML email footers", () => {
    const body =
      "Hi team,\n\nBPCA members often need audit-ready records. PestTrace helps.\n\nReply STOP to opt out.";
    const result = validateOutreachCopy(cleanSubject, body, "initial");
    assert.equal(result.ok, true);
  });
});

describe("messagePlainTextFromHtml", () => {
  it("extracts only message paragraphs, not footer or CTAs", () => {
    const html = `<table>
      <p data-outreach-body="true" style="margin:0 0 16px 0">We put together a snapshot for Acme based on your website.</p>
      <p data-outreach-body="true" style="margin:0 0 16px 0">It covers documentation visibility and audit readiness.</p>
      <a href="#">View your snapshot</a>
      <a href="#">Start 7-day free trial</a>
      <span>BPCA Certified</span>
      <td>You received this email because your business was found in a public directory. To opt out, reply with STOP.</td>
    </table>`;
    const message = messagePlainTextFromHtml(html);
    assert.ok(message.includes("snapshot for Acme"));
    assert.ok(!message.includes("View your snapshot"));
    assert.ok(!message.includes("public directory"));
  });

  it("falls back to legacy body paragraph style", () => {
    const html =
      '<p style="margin:0 0 16px 0;font-size:15px">Hello from the team.</p>' +
      '<p style="margin:0 0 16px 0;font-size:15px">Short follow-up copy.</p>' +
      '<td style="font-size:11px">Long opt-out footer with many words that should not count toward the limit.</td>';
    const message = messagePlainTextFromHtml(html);
    assert.equal(message, "Hello from the team.\n\nShort follow-up copy.");
  });
});

describe("validateEmailForSend", () => {
  it("passes when message body is under limit but full HTML exceeds it", () => {
    const bodyCopy = Array(130).fill("word").join(" ");
    const html = `<p data-outreach-body="true" style="margin:0 0 16px 0">${bodyCopy}</p>
      <a>View your snapshot</a>
      <td>${Array(50).fill("footer").join(" ")}</td>`;
    const result = validateEmailForSend("Audit snapshot for Acme?", html, "initial");
    assert.equal(result.ok, true);
  });

  it("strips markdown emphasis from LLM drafts before validation", () => {
    const html = `<p data-outreach-body="true" style="margin:0 0 16px 0">We prepared a **seasonal risk brief** for your team.</p>
      <p data-outreach-body="true" style="margin:0 0 16px 0">It covers rodent and insect pressure this quarter.</p>`;
    const result = validateEmailForSend("Seasonal pest risk brief for Acme?", html, "initial");
    assert.equal(result.ok, true);
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

describe("stripAiMetaPreamble", () => {
  it("removes professional B2B outreach email lead-in", () => {
    const raw =
      "Here is the professional B2B outreach email:\n\nDear Prospect,\n\nWe help teams.";
    assert.equal(stripAiMetaPreamble(raw), "Dear Prospect,\n\nWe help teams.");
  });

  it("strips meta from first HTML paragraph", () => {
    const html =
      '<p>Here is the professional B2B outreach email:</p><p>Dear Alex,</p><p>Body copy.</p>';
    const cleaned = stripAiMetaFromHtml(html);
    assert.ok(!/here is the professional/i.test(cleaned));
    assert.ok(cleaned.includes("Dear Alex"));
  });
});
