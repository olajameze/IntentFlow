/**
 * Drop-in IntentFlow conversion reporter for brand sites (Weathers / PestTrace).
 *
 * 1. Copy this file into your Next.js /book or checkout success page.
 * 2. Set INTENTFLOW_WEBHOOK_URL and INTENTFLOW_WEBHOOK_SECRET (from integrations/webhook-secrets.local.json).
 * 3. Call reportIntentFlowConversion() after payment / booking success.
 */

export function getOutreachProspectId() {
  if (typeof window === "undefined") return null;
  const fromUrl = new URLSearchParams(window.location.search).get("p");
  if (fromUrl) {
    try {
      sessionStorage.setItem("intentflow_prospect_id", fromUrl);
    } catch {
      /* ignore */
    }
    return fromUrl;
  }
  try {
    return sessionStorage.getItem("intentflow_prospect_id");
  } catch {
    return null;
  }
}

/**
 * @param {object} opts
 * @param {"deposit_paid"|"payment_completed"|"trial_started"|"booking_started"} opts.event
 * @param {string} opts.externalId - Stripe PI id, subscription id, etc. (idempotency)
 * @param {number} [opts.amount]
 * @param {string} [opts.currency]
 * @param {boolean} [opts.depositPaid]
 */
export async function reportIntentFlowConversion(opts) {
  const prospectId = getOutreachProspectId();
  if (!prospectId) return { skipped: true, reason: "no prospect id" };

  const url = process.env.NEXT_PUBLIC_INTENTFLOW_WEBHOOK_URL;
  const secret = process.env.NEXT_PUBLIC_INTENTFLOW_WEBHOOK_SECRET;
  if (!url || !secret) {
    console.warn("[IntentFlow] Missing NEXT_PUBLIC_INTENTFLOW_WEBHOOK_URL or SECRET");
    return { skipped: true, reason: "not configured" };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({
      prospect_id: prospectId,
      event: opts.event,
      external_id: opts.externalId,
      amount: opts.amount,
      currency: opts.currency ?? "gbp",
      deposit_paid: opts.depositPaid,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("[IntentFlow] conversion webhook failed", res.status, text);
    return { ok: false, status: res.status };
  }

  return res.json();
}
