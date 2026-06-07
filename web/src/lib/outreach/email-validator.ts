import blocklistData from "./data/email-blocklist.json";

export type OutreachCopyKind = "initial" | "followup";

export type ValidationResult = {
  ok: boolean;
  issues: string[];
};

/** AI assistant / meta-commentary phrases that must never appear in sent emails. */
export const AI_PHRASE_BLOCKLIST: readonly string[] = blocklistData.phrases;

const SPAM_TRIGGERS: readonly string[] = blocklistData.spam_triggers;

const WORD_LIMITS: Record<OutreachCopyKind, number> = {
  initial: 180,
  followup: 90,
};

const MARKDOWN_PATTERNS = [
  /\*\*[^*]+\*\*/,
  /^#{1,6}\s/m,
  /`[^`]+`/,
  /\[[^\]]+\]\([^)]+\)/,
];

const JSON_PATTERNS = [
  /^\s*[\[{]/,
  /"subject"\s*:/i,
  /"body"\s*:/i,
  /"name"\s*:/,
  /"website"\s*:/,
];

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function countUrls(text: string): number {
  const matches = text.match(/https?:\/\/[^\s]+|www\.[^\s]+/gi);
  return matches?.length ?? 0;
}

function hasAllCapsWords(text: string): boolean {
  return /\b[A-Z]{4,}\b/.test(text);
}

function hasDuplicateSentence(text: string): boolean {
  const sentences = text
    .split(/[.!?]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 20);
  const seen = new Set<string>();
  for (const s of sentences) {
    if (seen.has(s)) return true;
    seen.add(s);
  }
  return false;
}

function containsBlockedPhrase(text: string, phrases: readonly string[]): string | null {
  const low = text.toLowerCase();
  for (const phrase of phrases) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?:^|[^a-z])${escaped}(?:[^a-z]|$)`, "i");
    if (re.test(low)) return phrase;
  }
  return null;
}

/** Validate outreach email subject + body before send or after LLM generation. */
export function validateOutreachCopy(
  subject: string,
  body: string,
  kind: OutreachCopyKind = "initial",
): ValidationResult {
  const issues: string[] = [];
  const sub = subject.trim();
  const bod = body.trim();

  if (!sub) issues.push("Subject is empty");
  if (!bod) issues.push("Body is empty");
  if (bod.startsWith("[Draft")) issues.push("Body is a draft placeholder");
  if (sub.startsWith("[Draft")) issues.push("Subject is a draft placeholder");

  for (const field of [sub, bod]) {
    const aiPhrase = containsBlockedPhrase(field, AI_PHRASE_BLOCKLIST);
    if (aiPhrase) issues.push(`AI assistant phrase detected: "${aiPhrase}"`);

    const spam = containsBlockedPhrase(field, SPAM_TRIGGERS);
    if (spam) issues.push(`Spam trigger detected: "${spam}"`);
  }

  for (const pattern of MARKDOWN_PATTERNS) {
    if (pattern.test(bod)) {
      issues.push("Body contains markdown formatting");
      break;
    }
  }

  for (const pattern of JSON_PATTERNS) {
    if (pattern.test(bod) || pattern.test(sub)) {
      issues.push("Output contains JSON or structured data leakage");
      break;
    }
  }

  if (hasDuplicateSentence(bod)) issues.push("Body contains duplicated sentences");
  if (countUrls(bod) > 2) issues.push("Body contains too many URLs");
  if (hasAllCapsWords(sub)) issues.push("Subject contains excessive capitalization");
  if (hasAllCapsWords(bod)) issues.push("Body contains excessive capitalization");
  if (sub.includes("!")) issues.push("Subject contains exclamation mark");

  const limit = WORD_LIMITS[kind];
  if (wordCount(bod) > limit) {
    issues.push(`Body exceeds ${limit} word limit (${wordCount(bod)} words)`);
  }

  return { ok: issues.length === 0, issues };
}

/** Strip HTML tags for validation of stored email_body HTML. */
export function plainTextFromHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Normalize body text before validation (collapse excess newlines). */
export function normalizeOutreachBody(body: string): string {
  return body.replace(/\n{3,}/g, "\n\n").trim();
}
