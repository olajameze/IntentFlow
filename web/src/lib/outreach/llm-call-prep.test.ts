import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("llm-call-prep fallbacks", () => {
  it("exports campaign fallbacks when Groq unavailable", async () => {
    const prev = process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;

    const { generateCallPrep } = await import("./llm-call-prep");
    const script = await generateCallPrep(
      {
        id: "test-id",
        name: "Acme Pest",
        campaign: "pesttrace",
      },
      "reply",
      null,
    );

    assert.ok(script.opening_script.length > 20);
    assert.ok(script.talking_points.length >= 2);
    assert.ok(script.suggested_next_step.length > 5);

    if (prev) process.env.GROQ_API_KEY = prev;
  });
});
