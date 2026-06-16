/** Per-brand revenue source hints for Settings / Revenue screens. */

export const WEATHERS_BUSINESS_ID = "11111111-1111-1111-1111-111111111111";
export const PESTTRACE_BUSINESS_ID = "22222222-2222-2222-2222-222222222222";
export const JGDEVS_BUSINESS_ID = "33333333-3333-3333-3333-333333333333";

export type RevenueSourceMode = "stripe" | "manual";

export function revenueSourceMode(businessId: string, name: string): RevenueSourceMode {
  const id = businessId.toLowerCase();
  const n = name.toLowerCase();
  if (id === WEATHERS_BUSINESS_ID || n.includes("weathers")) return "manual";
  return "stripe";
}

export const STRIPE_RAK_DOCS = "https://docs.stripe.com/keys/create-api-key";

export const REVENUE_BRAND_GUIDE: { id: string; label: string; mode: RevenueSourceMode; detail: string }[] = [
  {
    id: WEATHERS_BUSINESS_ID,
    label: "Weathers Pest Solutions",
    mode: "manual",
    detail:
      "No Stripe account — log jobs, deposits, and invoices on Revenue → Import / manual, or import a bank/CSV export.",
  },
  {
    id: PESTTRACE_BUSINESS_ID,
    label: "PestTrace",
    mode: "stripe",
    detail:
      "Stripe secret keys are shown once. Create a new restricted key (Read: Balance, Balance transactions, Subscriptions) in the PestTrace Stripe Dashboard, paste it in Active portfolio, then run npm run engine:revenue.",
  },
  {
    id: JGDEVS_BUSINESS_ID,
    label: "JGDevs",
    mode: "stripe",
    detail:
      "Same as PestTrace — create a new restricted key in the JGDevs Stripe account (Read permissions above). Old keys cannot be viewed again.",
  },
];
