import { claritySessionsFromPayload, clarityUsersFromPayload, clarityWindowDaysFromPayload } from "@/lib/clarity-payload";

export type AnalyticsSnapshotRow = {
  id?: string;
  business_id?: string | null;
  captured_at?: string;
  source?: string;
  website_id?: string | null;
  payload?: unknown;
};

function capturedMs(row: AnalyticsSnapshotRow): number {
  const t = row.captured_at ? Date.parse(row.captured_at) : 0;
  return Number.isFinite(t) ? t : 0;
}

/** Newest snapshot per business (API returns desc; this is defensive). */
export function latestSnapshotPerBusiness(rows: AnalyticsSnapshotRow[]): Map<string, AnalyticsSnapshotRow> {
  const map = new Map<string, AnalyticsSnapshotRow>();
  for (const row of rows) {
    const bid = String(row.business_id ?? "");
    if (!bid) continue;
    const prev = map.get(bid);
    if (!prev || capturedMs(row) > capturedMs(prev)) {
      map.set(bid, row);
    }
  }
  return map;
}

export function filterSnapshotsForBusiness(
  rows: AnalyticsSnapshotRow[],
  businessId: string | "all",
): AnalyticsSnapshotRow[] {
  if (businessId === "all") return rows;
  const sel = businessId.toLowerCase();
  return rows.filter((row) => String(row.business_id ?? "").toLowerCase() === sel);
}

/** Last N sync points for one business, oldest → newest for charts. */
export function chartSnapshotsForBusiness(
  rows: AnalyticsSnapshotRow[],
  businessId: string | "all",
  limit = 14,
): AnalyticsSnapshotRow[] {
  const filtered = filterSnapshotsForBusiness(rows, businessId);
  const sorted = [...filtered].sort((a, b) => capturedMs(a) - capturedMs(b));
  return sorted.slice(-limit);
}

export function totalsFromLatestSnapshots(
  rows: AnalyticsSnapshotRow[],
  businessId: string | "all",
): { sessions: number; users: number; lastSyncedAt: string | null; windowDays: number } {
  const filtered = filterSnapshotsForBusiness(rows, businessId);
  if (businessId === "all") {
    const latest = latestSnapshotPerBusiness(filtered);
    let sessions = 0;
    let users = 0;
    let lastSyncedAt: string | null = null;
    let windowDays = 3;
    for (const snap of Array.from(latest.values())) {
      sessions += claritySessionsFromPayload(snap.payload);
      users += clarityUsersFromPayload(snap.payload);
      windowDays = Math.max(windowDays, clarityWindowDaysFromPayload(snap.payload));
      const at = snap.captured_at ?? null;
      if (at && (!lastSyncedAt || capturedMs(snap) > Date.parse(lastSyncedAt))) {
        lastSyncedAt = at;
      }
    }
    return { sessions, users, lastSyncedAt, windowDays };
  }

  const sorted = [...filtered].sort((a, b) => capturedMs(b) - capturedMs(a));
  const latest = sorted[0];
  if (!latest) return { sessions: 0, users: 0, lastSyncedAt: null, windowDays: 3 };
  return {
    sessions: claritySessionsFromPayload(latest.payload),
    users: clarityUsersFromPayload(latest.payload),
    lastSyncedAt: latest.captured_at ?? null,
    windowDays: clarityWindowDaysFromPayload(latest.payload),
  };
}

export function formatSnapshotLabel(capturedAt: string | undefined): string {
  if (!capturedAt) return "—";
  const d = new Date(capturedAt);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
