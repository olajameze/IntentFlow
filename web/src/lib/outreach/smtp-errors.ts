/** Normalize nodemailer / SMTP errors for API responses and logs. */
export function formatMailError(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as {
      message?: string;
      response?: string;
      responseCode?: number;
      code?: string;
    };
    const parts: string[] = [];
    if (e.message) parts.push(e.message);
    if (e.response && !parts.some((p) => p.includes(e.response!))) parts.push(e.response);
    if (e.responseCode) parts.push(`SMTP code ${e.responseCode}`);
    if (e.code && e.code !== "EMESSAGE") parts.push(e.code);
    if (parts.length) return parts.join(" — ");
  }
  return err instanceof Error ? err.message : String(err);
}

/** Actionable hint when SMTP send fails (Brevo-focused). */
export function smtpTroubleshootingHint(message: string): string | undefined {
  const low = message.toLowerCase();
  if (
    low.includes("invalid login") ||
    low.includes("authentication") ||
    low.includes("535") ||
    low.includes("auth")
  ) {
    return "Brevo SMTP login failed. In Vercel → Settings → Environment Variables, set SMTP_USER to your Brevo login email and SMTP_PASSWORD to a Brevo SMTP key (SMTP & API → SMTP keys). Re-sync from web/.env.local if sends work locally.";
  }
  if (
    low.includes("sender") ||
    low.includes("from") ||
    low.includes("not authorized") ||
    low.includes("verified")
  ) {
    return "Brevo rejected the From address. In Brevo → Senders, verify OUTREACH_FROM_EMAIL (and match it on Vercel).";
  }
  if (low.includes("timeout") || low.includes("etimedout") || low.includes("econnrefused")) {
    return "Could not reach the SMTP server from Vercel. Confirm SMTP_HOST is smtp-relay.brevo.com and SMTP_PORT is 587. Check Brevo for IP allowlisting.";
  }
  if (low.includes("not configured")) {
    return "SMTP env vars missing on this deployment. Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD, OUTREACH_FROM_EMAIL on Vercel Production.";
  }
  return undefined;
}
