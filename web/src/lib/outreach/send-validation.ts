import {
  messagePlainTextFromHtml,
  plainTextFromHtml,
  stripAiMetaFromHtml,
  stripAiMetaPreamble,
  validateOutreachCopy,
  type OutreachCopyKind,
} from "@/lib/outreach/email-validator";

export type SendValidationResult =
  | { ok: true; subject: string; plainBody: string }
  | { ok: false; issues: string[] };

/** Final gate before SMTP/Resend — validates subject + message body (not template footer/CTAs). */
export function validateEmailForSend(
  subject: string,
  htmlBody: string,
  kind: OutreachCopyKind = "initial",
): SendValidationResult {
  const cleanedHtml = stripAiMetaFromHtml(htmlBody);
  const messagePlain = stripAiMetaPreamble(messagePlainTextFromHtml(cleanedHtml));
  const result = validateOutreachCopy(subject, messagePlain, kind);
  if (!result.ok) {
    return { ok: false, issues: result.issues };
  }
  const fullPlain = stripAiMetaPreamble(plainTextFromHtml(cleanedHtml));
  return { ok: true, subject: subject.trim(), plainBody: fullPlain };
}
