import { getPublicBaseUrl } from "@/lib/outreach/public-base-url";

/** Public URL for a tokenized audit snapshot page. */
export function snapshotPublicUrl(token: string, req?: Request): string {
  const base = getPublicBaseUrl(req);
  if (!base) return `/r/${token}`;
  return `${base.replace(/\/$/, "")}/r/${token}`;
}
