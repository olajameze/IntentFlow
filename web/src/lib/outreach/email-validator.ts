import blocklistData from "./data/email-blocklist.json";

export type OutreachCopyKind = "initial" | "followup";

export type ValidationResult = {
  ok: boolean;
  issues: string[];
};

/** AI assistant / meta-commentary phrases that must never appear in sent emails. */
export const AI_PHRASE_BLOCKLIST: readonly string[] = blocklistData.phrases;

/** LLM task-leak phrases — reject anywhere in the message body. */
const AI_LEAK_PHRASES: readonly string[] = [
  "professional outreach email",
  "professional b2b outreach email",
  "b2b outreach email",
  "draft email",
  "as requested",
  "as instructed",
  "following are",
  "target audience:",
  "strategy:",
  "return json",
  "uk english",
];

const AI_PREAMBLE_META_PATTERNS: readonly RegExp[] = [
  /^here is the (professional|draft|cold|b2b|outreach)/i,
  /^here are (the|two|both|some|following)/i,
  /^below is (the|a) (draft|email|professional)/i,
  /^below are (the|two|following)/i,
  /^following is (the|a)/i,
  /^following are (the|two)/i,
];

/** Preamble-only phrases — not matched mid-sentence (e.g. "the gap here is …"). */
const AI_PREAMBLE_LINE_PHRASES: readonly string[] = [
  "i'd be happy to",
  "i would be happy to",
  "i hope this email finds you well",
  "just reaching out",
  "i wanted to touch base",
  "circling back",
  "as instructed",
  "as requested",
];

const AI_SUBJECT_PHRASES: readonly string[] = [...AI_PHRASE_BLOCKLIST];

const SPAM_TRIGGERS: readonly string[] = blocklistData.spam_triggers;
const WORD_LIMITS: Record<OutreachCopyKind, number> = {
  /** LLM drafts often run slightly over prompt limits; allow headroom at send time. */
  initial: 260,
  followup: 100,
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

/** Brand sites + snapshot/tracking links are rendered as buttons — not raw body spam. */
const PORTFOLIO_URL_HOSTS = [
  "pesttrace.com",
  "weatherspestsolutions.co.uk",
  "jgdev.co.uk",
  "jordans-e-website.vercel.app",
];

function isTemplateOrPortfolioUrl(raw: string): boolean {
  const trimmed = raw.trim().replace(/[.,;:!?)]+$/, "");
  try {
    const href = trimmed.startsWith("www.") ? `https://${trimmed}` : trimmed;
    const u = new URL(href);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (PORTFOLIO_URL_HOSTS.some((d) => host === d || host.endsWith(`.${d}`))) {
      return true;
    }
    const path = u.pathname.toLowerCase();
    if (path.startsWith("/r/") || path.startsWith("/q/") || path.includes("/api/outreach-track/")) {
      return true;
    }
  } catch {
    /* not a parseable URL */
  }
  return false;
}

/** Drop sign-off lines that are only a URL (CTA buttons carry links). */
function stripSignOffUrlLines(text: string): string {
  return text
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return !/^https?:\/\/\S+$/i.test(t) && !/^www\.\S+$/i.test(t);
    })
    .join("\n");
}

function countUrls(text: string): number {
  const cleaned = stripSignOffUrlLines(text);
  const matches = cleaned.match(/https?:\/\/[^\s<>"']+|www\.[^\s<>"']+/gi) ?? [];
  return matches.filter((m) => !isTemplateOrPortfolioUrl(m)).length;
}

/** Flag shouty words (6+ letters) in subjects; bodies may cite BRCGS, HACCP, HTTPS, etc. */
function hasShoutyAllCapsWords(text: string): boolean {
  return /\b[A-Z]{6,}\b/.test(text);
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

function bodyPreambleText(body: string): string {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  return lines.slice(0, 2).join("\n").slice(0, 320);
}

function containsAiPhraseInBody(body: string): string | null {
  const leak = containsBlockedPhrase(body, AI_LEAK_PHRASES);
  if (leak) return leak;

  const preamble = bodyPreambleText(body);
  for (const line of preamble.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    for (const pattern of AI_PREAMBLE_META_PATTERNS) {
      if (pattern.test(trimmed)) {
        return trimmed.slice(0, 40);
      }
    }
    const lineHit = containsBlockedPhrase(trimmed, AI_PREAMBLE_LINE_PHRASES);
    if (lineHit) return lineHit;
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
    const aiPhrase =
      field === bod
        ? containsAiPhraseInBody(bod)
        : containsBlockedPhrase(field, AI_SUBJECT_PHRASES);
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
  if (hasShoutyAllCapsWords(sub)) issues.push("Subject contains excessive capitalization");
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
function extractMessageParagraphs(html: string): string {
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

  return "";
}

export function messagePlainTextFromHtml(html: string): string {
  const fromTaggedOrLegacy = extractMessageParagraphs(html);
  if (fromTaggedOrLegacy) return fromTaggedOrLegacy;

  const contentCell = html.match(
    /<td[^>]*padding:\s*28px\s+28px\s+8px\s+28px[^>]*>([\s\S]*?)<\/td>/i,
  );
  if (contentCell?.[1]) {
    const fromCell = extractMessageParagraphs(contentCell[1]);
    if (fromCell) return fromCell;
    const cellPlain = plainTextFromHtml(contentCell[1]).trim();
    if (cellPlain) return cellPlain;
  }

  return plainTextFromHtml(html);
}

function isMetaPreambleLine(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  for (const pattern of AI_PREAMBLE_META_PATTERNS) {
    if (pattern.test(t)) return true;
  }
  if (/professional.*(b2b\s*)?outreach.*email/i.test(t) && t.length < 160) return true;
  if (containsBlockedPhrase(t, AI_PREAMBLE_LINE_PHRASES)) return true;
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
    if (!isMetaPreambleLine(inner)) break;
    out = out.replace(match[0], "");
  }
  return out.trim();
}

/** Normalize body text before validation (strip meta + collapse excess newlines). */
export function stripMarkdownFormatting(text: string): string {
  return text
    .replace(/\*\*\*([^*]+)\*\*\*/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(?<![*])\*(?![*])([^*\n]+)\*(?![*])/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");
}

/** Normalize body text before validation (strip meta + collapse excess newlines). */
export function normalizeOutreachBody(body: string): string {
  return stripMarkdownFormatting(
    stripAiMetaPreamble(body.replace(/\n{3,}/g, "\n\n").trim()),
  );
}
