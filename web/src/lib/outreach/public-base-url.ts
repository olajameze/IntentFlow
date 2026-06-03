/** Resolve the public base URL for open/click tracking pixels and redirects. */
export function getPublicBaseUrl(req?: Request): string {
  const fromEnv =
    process.env.OUTREACH_PUBLIC_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.trim()}`
      : "");
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (req) {
    try {
      return new URL(req.url).origin;
    } catch {
      return "";
    }
  }
  return "";
}
