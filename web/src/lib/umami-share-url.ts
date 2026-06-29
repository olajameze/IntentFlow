/** Validate Umami public share links for iframe embed (no API key). */

export function normalizeUmamiShareUrl(raw: string | undefined | null): string | null {
  if (raw === undefined || raw === null) return null;
  const t = String(raw).trim();
  if (!t) return null;
  const candidate = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(candidate);
    if (u.protocol !== "https:") return null;
    const host = u.hostname.toLowerCase();
    const path = u.pathname.toLowerCase();
    const looksLikeShare =
      path.includes("/share/") ||
      (host.includes("umami") && (path.includes("/share") || path.includes("/s/")));
    if (!looksLikeShare && !host.includes("umami")) return null;
    return u.href;
  } catch {
    return null;
  }
}

export function umamiShareUrlInvalidMessage(): string {
  return "Paste the full Umami Share URL (https://cloud.umami.is/share/… or /analytics/eu/share/…).";
}
