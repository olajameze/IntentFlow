import {
  normalizeOutreachBody,
  validateOutreachCopy,
  type OutreachCopyKind,
} from "@/lib/outreach/email-validator";
import { outreachLog } from "@/lib/outreach/logger";

const STRICT_SUFFIX =
  "\n\nCRITICAL: Output ONLY the email subject and body. No preamble, no assistant phrases, no labels, no JSON.";

export type ValidatedCopyResult = {
  subject: string;
  body: string;
  attempts: number;
  validated: boolean;
};

export async function generateValidatedCopy(
  generate: (attempt: number, strict: boolean) => Promise<{ subject: string; body: string }>,
  opts: {
    maxAttempts?: number;
    kind: OutreachCopyKind;
    fallbackSubject: string;
    fallbackBody: string;
    prospectId?: string;
    campaign?: string;
  },
): Promise<ValidatedCopyResult> {
  const maxAttempts = opts.maxAttempts ?? 3;
  let lastIssues: string[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const strict = attempt > 1;
    const raw = await generate(attempt, strict);
    const subject = raw.subject.trim().slice(0, 120);
    const body = normalizeOutreachBody(raw.body);
    const result = validateOutreachCopy(subject, body, opts.kind);

    if (result.ok) {
      return { subject, body, attempts: attempt, validated: true };
    }

    lastIssues = result.issues;
    outreachLog({
      level: "warn",
      event: "outreach_copy_validation_failed",
      prospectId: opts.prospectId,
      campaign: opts.campaign,
      attempt,
      issues: result.issues,
    });
  }

  outreachLog({
    level: "error",
    event: "outreach_copy_fallback_used",
    prospectId: opts.prospectId,
    campaign: opts.campaign,
    attempt: maxAttempts,
    issues: lastIssues,
  });

  return {
    subject: opts.fallbackSubject,
    body: opts.fallbackBody,
    attempts: maxAttempts,
    validated: false,
  };
}

export function appendStrictInstruction(prompt: string, strict: boolean): string {
  return strict ? `${prompt}${STRICT_SUFFIX}` : prompt;
}
