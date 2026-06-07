import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeLeadScore } from "./lead-scoring";

describe("lead-scoring", () => {
  it("returns capped score with breakdown", () => {
    const { score, breakdown } = computeLeadScore({
      campaign: "weathers",
      sector: "restaurant",
      email: "info@example.co.uk",
      country: "UK",
      city: "Birmingham",
      phone: "0121 555 0100",
      raw: {
        research: {
          services: ["pest control", "rodent"],
          has_https: true,
          has_contact_page: true,
          page_text_length: 2000,
          contact_name: "Jane Smith",
          phone: "0121 555 0100",
          page_text_sample: "HACCP compliance audit support",
        },
      },
    });
    assert.ok(score > 0 && score <= 100);
    assert.ok(breakdown.website_quality > 0);
    assert.ok(breakdown.research_boost >= 10);
  });
});
