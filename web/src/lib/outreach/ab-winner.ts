export type AbVariantStats = {
  variant: "A" | "B";
  sent: number;
  opened: number;
  replied: number;
};

export type AbWinnerResult = {
  winner: "A" | "B" | null;
  confidence: number;
  reason: string;
};

const MIN_SENDS_PER_VARIANT = 20;

export function pickAbWinner(
  variantA: AbVariantStats,
  variantB: AbVariantStats,
): AbWinnerResult {
  if (variantA.sent < MIN_SENDS_PER_VARIANT || variantB.sent < MIN_SENDS_PER_VARIANT) {
    return {
      winner: null,
      confidence: 0,
      reason: `Need at least ${MIN_SENDS_PER_VARIANT} sends per variant`,
    };
  }

  const rateA = variantA.replied / variantA.sent;
  const rateB = variantB.replied / variantB.sent;

  if (rateA === rateB) {
    const openA = variantA.opened / variantA.sent;
    const openB = variantB.opened / variantB.sent;
    if (openA === openB) {
      return { winner: null, confidence: 0, reason: "Tie on reply and open rates" };
    }
    const winner = openA > openB ? "A" : "B";
    const confidence = Math.abs(openA - openB);
    return { winner, confidence, reason: "Winner by open rate" };
  }

  const winner = rateA > rateB ? "A" : "B";
  const confidence = Math.abs(rateA - rateB);
  if (confidence < 0.02) {
    return { winner: null, confidence, reason: "Reply rate difference below 2% threshold" };
  }
  return { winner, confidence, reason: "Winner by reply rate" };
}
