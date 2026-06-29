/**
 * Parse Microsoft Clarity Data Export API payloads stored in analytics_snapshots.
 * @see https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-data-export-api
 */

type ClarityInformationRow = Record<string, unknown>;

type ClarityMetricBlock = {
  metricName?: string;
  information?: ClarityInformationRow[];
};

function parseCount(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.round(raw);
  if (typeof raw === "string") {
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function metricsFromPayload(payload: unknown): ClarityMetricBlock[] {
  if (!payload || typeof payload !== "object") return [];
  const p = payload as Record<string, unknown>;
  if (Array.isArray(p.metrics)) return p.metrics as ClarityMetricBlock[];
  if (Array.isArray(payload)) return payload as ClarityMetricBlock[];
  return [];
}

function sumTrafficBlock(block: ClarityMetricBlock): { sessions: number; users: number } {
  const rows = block.information ?? [];
  let sessions = 0;
  let users = 0;
  for (const row of rows) {
    sessions += parseCount(row.totalSessionCount);
    users += parseCount(row.distantUserCount ?? row.distinctUserCount);
  }
  return { sessions, users };
}

export function clarityTotalsFromPayload(payload: unknown): { sessions: number; users: number } {
  if (!payload || typeof payload !== "object") return { sessions: 0, users: 0 };
  const p = payload as Record<string, unknown>;
  const totals = p.totals as Record<string, unknown> | undefined;
  if (totals) {
    return {
      sessions: parseCount(totals.sessions ?? totals.totalSessionCount),
      users: parseCount(totals.users ?? totals.distantUserCount ?? totals.distinctUserCount),
    };
  }
  if (typeof p.sessions === "number" || typeof p.sessions === "string") {
    return {
      sessions: parseCount(p.sessions),
      users: parseCount(p.users ?? p.distantUserCount),
    };
  }
  for (const block of metricsFromPayload(payload)) {
    if (String(block.metricName ?? "").toLowerCase() === "traffic") {
      return sumTrafficBlock(block);
    }
  }
  return { sessions: 0, users: 0 };
}

/** Sessions — primary traffic metric for charts (Clarity API). */
export function claritySessionsFromPayload(payload: unknown): number {
  return clarityTotalsFromPayload(payload).sessions;
}

/** Distinct users from Traffic metric rows. */
export function clarityUsersFromPayload(payload: unknown): number {
  return clarityTotalsFromPayload(payload).users;
}

export function clarityWindowDaysFromPayload(payload: unknown): number {
  if (!payload || typeof payload !== "object") return 3;
  const raw = (payload as Record<string, unknown>).numOfDays;
  const n = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? 3), 10);
  return Number.isFinite(n) && n >= 1 && n <= 3 ? n : 3;
}
