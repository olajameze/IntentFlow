/** Locale rules for outreach LLM calls (mirrors engine/tools/outreach_locale.py). */
export function localeRulesForCountry(country: string | null | undefined): string {
  const c = (country || "").trim().toUpperCase() || "INT";
  return `
Recipient market country code: ${c}
- Use professional English matched to that market (US/CA/AU: American English; UK/IE: British English; DE/FR/ES/IT/NL and other EU: clear international English).
- Do NOT mention the United Kingdom, UK, or "UK pest control" unless the country code is exactly UK.
- Name regulators only when credible for that market: BRCGS/SALSA/BPCA/BS EN 16636 (UK); EU biocide/PPP and audit record expectations (DE, FR, ES, IT, NL, IE); FSSAI/state food-safety audits (IN); EPA/state licensing (US).
- Write for pest control operators globally — never imply the product is UK-only.
`.trim();
}
