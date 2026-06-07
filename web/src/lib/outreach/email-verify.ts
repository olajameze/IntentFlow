import dns from "dns/promises";

const EMAIL_RE = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
const ROLE_LOCAL_PREFIXES = ["noreply", "no-reply", "donotreply", "do-not-reply", "mailer-daemon"];

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

const mxCache = new Map<string, { ok: boolean; expires: number }>();
const MX_TTL_MS = 60 * 60 * 1000;

export async function hasMxRecords(domain: string): Promise<boolean> {
  const key = domain.toLowerCase();
  const cached = mxCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.ok;

  let ok = false;
  try {
    const records = await dns.resolveMx(domain);
    ok = records.length > 0;
  } catch {
    ok = false;
  }
  mxCache.set(key, { ok, expires: Date.now() + MX_TTL_MS });
  return ok;
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

  const local = trimmed.split("@")[0] ?? "";
  if (ROLE_LOCAL_PREFIXES.some((p) => local === p || local.startsWith(`${p}+`))) {
    return { ok: false, reason: "Role account address" };
  }

  const brevo = await verifyViaBrevoApi(trimmed);
  if (brevo) return brevo;

  const domain = trimmed.split("@")[1];
  if (!domain) return { ok: false, reason: "Missing domain" };
  const mx = await hasMxRecords(domain);
  if (!mx) return { ok: false, reason: "No MX records for domain" };
  return { ok: true };
}
