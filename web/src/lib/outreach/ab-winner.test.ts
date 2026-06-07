import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickAbWinner } from "./ab-winner";

describe("ab-winner", () => {
  it("requires minimum sample size", () => {
    const result = pickAbWinner(
      { variant: "A", sent: 10, opened: 5, replied: 2 },
      { variant: "B", sent: 25, opened: 10, replied: 5 },
    );
    assert.equal(result.winner, null);
    assert.match(result.reason, /20/);
  });

  it("picks higher reply rate variant", () => {
    const result = pickAbWinner(
      { variant: "A", sent: 30, opened: 15, replied: 6 },
      { variant: "B", sent: 30, opened: 12, replied: 3 },
    );
    assert.equal(result.winner, "A");
    assert.equal(result.reason, "Winner by reply rate");
  });

  it("returns null when reply rates tie within threshold", () => {
    const result = pickAbWinner(
      { variant: "A", sent: 30, opened: 10, replied: 3 },
      { variant: "B", sent: 30, opened: 10, replied: 3 },
    );
    assert.equal(result.winner, null);
  });
});
