/** Microsoft Clarity Data Export API client. */

import { clarityTotalsFromPayload } from "@/lib/clarity-payload";

const CLARITY_EXPORT_URL = "https://www.clarity.ms/export-data/api/v1/project-live-insights";

export type ClarityLiveInsights = Record<string, unknown>;

export function claritySnapshotDays(): number {
  const raw = process.env.CLARITY_SNAPSHOT_DAYS?.trim() || "3";
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 && n <= 3 ? n : 3;
}

function clarityApiToken(explicit?: string): string {
  const token = (explicit || process.env.CLARITY_API_TOKEN || "").trim();
  if (!token) {
    throw new Error(
      "Clarity API token missing — save a token in Settings for this brand, or set CLARITY_API_TOKEN in web/.env.local.",
    );
  }
  return token;
}

export async function fetchClarityLiveInsights(
  projectId: string,
  numOfDays: number = claritySnapshotDays(),
  apiToken?: string,
): Promise<ClarityLiveInsights> {
  const pid = projectId.trim();
  if (!pid) throw new Error("clarity_project_id is required");

  const days = Math.max(1, Math.min(3, numOfDays));
  const url = new URL(CLARITY_EXPORT_URL);
  url.searchParams.set("projectId", pid);
  url.searchParams.set("numOfDays", String(days));

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${clarityApiToken(apiToken)}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Clarity export ${res.status}: ${body.slice(0, 240)}`);
  }

  const metrics = (await res.json()) as unknown;
  const totals = clarityTotalsFromPayload({ metrics });
  return {
    metrics,
    clarity_project_id: pid,
    numOfDays: days,
    totals,
    sessions: totals.sessions,
    users: totals.users,
  };
}

export async function checkClarityApiToken(projectId: string, apiToken?: string): Promise<{
  ok: boolean;
  status: number;
  message: string;
}> {
  try {
    await fetchClarityLiveInsights(projectId, 1, apiToken);
    return { ok: true, status: 200, message: "Clarity API token accepted" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Clarity check failed";
    const statusMatch = msg.match(/Clarity export (\d+)/);
    return {
      ok: false,
      status: statusMatch ? Number.parseInt(statusMatch[1], 10) : 0,
      message: msg,
    };
  }
}
