import {
  plainTextFromHtml,
  validateOutreachCopy,
  type OutreachCopyKind,
} from "@/lib/outreach/email-validator";

export type SendValidationResult =
  | { ok: true; subject: string; plainBody: string }
  | { ok: false; issues: string[] };

/** Final gate before SMTP/Resend — validates subject + plain body extracted from HTML. */
export function validateEmailForSend(
  subject: string,
  htmlBody: string,
  kind: OutreachCopyKind = "initial",
): SendValidationResult {
  const plainBody = plainTextFromHtml(htmlBody);
  const result = validateOutreachCopy(subject, plainBody, kind);
  if (!result.ok) {
    return { ok: false, issues: result.issues };
  }
  return { ok: true, subject: subject.trim(), plainBody };
}
