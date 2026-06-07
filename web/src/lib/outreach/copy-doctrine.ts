/** Conversion-focused copy rules for outreach LLM calls (web follow-ups). */
export const OUTREACH_CONVERSION_DOCTRINE = `
Conversion playbook:
- One clear problem, one proof point, one CTA. No begging or fake urgency.
- Match English to recipient country; do not mention UK unless country is UK.
- After a click: acknowledge they looked at booking/signup; remove friction (deposit off invoice, trial, audit-ready).
- Max 90 words for follow-up body unless break-up touch (max 60 words).
- Never paste raw URLs — the email template adds the CTA button.
- Short paragraphs only (max 3 sentences each). No exclamation marks in subject lines.
- Never use spam triggers: FREE, ACT NOW, limited time, click here now.
- Sign off with plain name and role — no stacked "Best regards" phrases.
- Output ONLY email copy. Never write "Here is", "Below is", "Certainly", or "I can help".
`.trim();
