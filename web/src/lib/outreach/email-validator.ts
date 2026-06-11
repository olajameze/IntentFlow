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
  /** HTML templates add footer/unsubscribe copy; plain-text extract runs slightly over LLM word count. */
  initial: 220,
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

/** Flag shouty words (5+ letters); allow short acronyms e.g. BPCA, STOP in footers. */
function hasAllCapsWords(text: string): boolean {
  return /\b[A-Z]{5,}\b/.test(text);
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

/** Extract LLM message paragraphs only — excludes CTA buttons, trust badges, and opt-out footer. */
export function messagePlainTextFromHtml(html: string): string {
  const tagged = Array.from(
    html.matchAll(/<p[^>]*data-outreach-body="true"[^>]*>([\s\S]*?)<\/p>/gi),
  );
  if (tagged.length > 0) {
    return plainTextFromHtml(tagged.map((m) => `<p>${m[1]}</p>`).join(""));
  }

  const legacy = Array.from(
    html.matchAll(/<p[^>]*style="margin:0 0 16px 0;[^"]*"[^>]*>([\s\S]*?)<\/p>/gi),
  );
  if (legacy.length > 0) {
    return plainTextFromHtml(legacy.map((m) => `<p>${m[1]}</p>`).join(""));
  }

  return plainTextFromHtml(html);
}

function isMetaPreambleLine(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  const low = t.toLowerCase();
  if (/^(here (is|are)|below (is|are)|following (is|are))\b/.test(low)) return true;
  if (/professional.*(b2b\s*)?outreach.*email/i.test(t) && t.length < 160) return true;
  if (containsBlockedPhrase(t, AI_PHRASE_BLOCKLIST)) return true;
  return false;
}

/** Remove LLM meta preamble lines (e.g. "Here is the professional B2B outreach email:"). */
export function stripAiMetaPreamble(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  while (lines.length > 0 && isMetaPreambleLine(lines[0] ?? "")) {
    lines.shift();
  }
  let joined = lines.join("\n").trim();
  const inlineLead = /^(here (is|are) the professional[^\n]+)\n?/i;
  while (inlineLead.test(joined)) {
    joined = joined.replace(inlineLead, "").trim();
  }
  return joined.replace(/\n{3,}/g, "\n\n").trim();
}

/** Strip meta preamble from the first HTML paragraph(s) in stored email_body. */
export function stripAiMetaFromHtml(html: string): string {
  let out = html;
  for (let i = 0; i < 3; i++) {
    const match = out.match(/<p[^>]*>[\s\S]*?<\/p>/i);
    if (!match) break;
    const inner = plainTextFromHtml(match[0]);
    if (!isMetaPreambleLine(inner) && !containsBlockedPhrase(inner, AI_PHRASE_BLOCKLIST)) break;
    out = out.replace(match[0], "");
  }
  return out.trim();
}

/** Normalize body text before validation (strip meta + collapse excess newlines). */
export function normalizeOutreachBody(body: string): string {
  return stripAiMetaPreamble(body.replace(/\n{3,}/g, "\n\n").trim());
}
