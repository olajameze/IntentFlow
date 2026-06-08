const SNAPSHOT_URL_PLACEHOLDER = "__SNAPSHOT_URL__";

export function extractSnapshotToken(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const snapshot = (raw as Record<string, unknown>).snapshot;
  if (!snapshot || typeof snapshot !== "object") return null;
  const token = (snapshot as Record<string, unknown>).token;
  return typeof token === "string" && token.trim() ? token.trim() : null;
}

export function applySnapshotUrlToHtml(
  html: string,
  raw: unknown,
  baseUrl: string,
): { html: string; error?: string } {
  if (!html.includes(SNAPSHOT_URL_PLACEHOLDER)) {
    return { html };
  }
  if (!baseUrl.trim()) {
    return {
      html,
      error:
        "OUTREACH_PUBLIC_BASE_URL is required to send emails with snapshot links. Set it in web/.env.local.",
    };
  }
  const token = extractSnapshotToken(raw);
  if (!token) {
    return {
      html,
      error: "Email contains a snapshot link but this prospect has no snapshot token.",
    };
  }
  const url = `${baseUrl.replace(/\/$/, "")}/r/${token}`;
  return { html: html.replaceAll(SNAPSHOT_URL_PLACEHOLDER, url) };
}
