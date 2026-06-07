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

/** Optional Brevo contacts API validation when BREVO_API_KEY is set. */
async function verifyViaBrevoApi(email: string): Promise<EmailVerifyResult | null> {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  if (!apiKey) return null;

  try {
    const res = await fetch("https://api.brevo.com/v3/contacts/emailStatus/" + encodeURIComponent(email), {
      headers: { "api-key": apiKey, Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: { deliverable?: boolean; reason?: string } };
    if (data.result?.deliverable === false) {
      return { ok: false, reason: data.result.reason || "Brevo marked undeliverable" };
    }
    if (data.result?.deliverable === true) return { ok: true };
  } catch {
    // fall through to MX check
  }
  return null;
}

/** Lightweight pre-send verification (format + MX, optional Brevo API). */
export async function verifyOutreachEmail(email: string): Promise<EmailVerifyResult> {
  const trimmed = email.trim().toLowerCase();
  if (!isValidEmailFormat(trimmed)) {
    return { ok: false, reason: "Invalid email format" };
  }

  const brevo = await verifyViaBrevoApi(trimmed);
  if (brevo) return brevo;

  const domain = trimmed.split("@")[1];
  if (!domain) return { ok: false, reason: "Missing domain" };
  const mx = await hasMxRecords(domain);
  if (!mx) return { ok: false, reason: "No MX records for domain" };
  return { ok: true };
}
