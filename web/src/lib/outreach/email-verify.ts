import dns from "dns/promises";

const EMAIL_RE = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

export type EmailVerifyResult = {
  ok: boolean;
  reason?: string;
};

export function isValidEmailFormat(email: string): boolean {
  const e = email.trim().toLowerCase();
  if (!e || e.length > 254) return false;
  if (!EMAIL_RE.test(e)) return false;
  const [local, domain] = e.split("@");
  if (!local || !domain || domain.split(".").length < 2) return false;
  return true;
}

export async function hasMxRecords(domain: string): Promise<boolean> {
  try {
    const records = await dns.resolveMx(domain);
    return records.length > 0;
  } catch {
    return false;
  }
}

/** Lightweight pre-send verification (format + MX). */
export async function verifyOutreachEmail(email: string): Promise<EmailVerifyResult> {
  const trimmed = email.trim().toLowerCase();
  if (!isValidEmailFormat(trimmed)) {
    return { ok: false, reason: "Invalid email format" };
  }
  const domain = trimmed.split("@")[1];
  if (!domain) return { ok: false, reason: "Missing domain" };
  const mx = await hasMxRecords(domain);
  if (!mx) return { ok: false, reason: "No MX records for domain" };
  return { ok: true };
}
