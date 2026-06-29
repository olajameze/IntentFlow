/** Umami Cloud / self-hosted stats client (mirrors engine/tools/umami.py). */

type UmamiTarget = {
  baseUrl: string;
  layout: "client" | "legacy";
  auth: "cloud_key" | "bearer";
};

function resolveUmamiTarget(): UmamiTarget {
  const explicit = process.env.UMAMI_API_CLIENT_ENDPOINT?.trim();
  const site = (process.env.UMAMI_URL || process.env.NEXT_PUBLIC_UMAMI_URL || "").trim();

  if (explicit) {
    const base = explicit.replace(/\/$/, "");
    if (base.toLowerCase().includes("api.umami.is")) {
      return { baseUrl: base, layout: "client", auth: "cloud_key" };
    }
    return { baseUrl: base, layout: "client", auth: "bearer" };
  }

  if (site.toLowerCase().includes("cloud.umami.is")) {
    const region = (process.env.UMAMI_CLOUD_REGION || "").trim().toLowerCase();
    if (region === "us" || region === "eu") {
      return { baseUrl: `https://api.umami.is/v1/${region}`, layout: "client", auth: "cloud_key" };
    }
    return { baseUrl: "https://api.umami.is/v1", layout: "client", auth: "cloud_key" };
  }

  if (!site) {
    throw new Error("UMAMI_URL or NEXT_PUBLIC_UMAMI_URL is not configured");
  }

  return { baseUrl: site.replace(/\/$/, ""), layout: "legacy", auth: "bearer" };
}

function umamiHeaders(auth: "cloud_key" | "bearer"): Record<string, string> {
  if (auth === "cloud_key") {
    const key = (process.env.UMAMI_API_KEY || process.env.UMAMI_API_TOKEN || "").trim();
    if (!key) {
      throw new Error(
        "Umami Cloud requires UMAMI_API_KEY or UMAMI_API_TOKEN (Cloud → Settings → API keys).",
      );
    }
    return { "x-umami-api-key": key, Accept: "application/json" };
  }
  const token = (process.env.UMAMI_API_TOKEN || "").trim();
  if (!token) throw new Error("UMAMI_API_TOKEN is not configured");
  return { Authorization: `Bearer ${token}`, Accept: "application/json" };
}

function websiteUrl(base: string, layout: "client" | "legacy", websiteId: string, resource: string): string {
  const b = base.replace(/\/$/, "");
  if (layout === "client") return `${b}/websites/${websiteId}/${resource}`;
  return `${b}/api/websites/${websiteId}/${resource}`;
}

export type UmamiStatsPayload = Record<string, unknown>;

export type UmamiWebsite = {
  id: string;
  name: string;
  domain?: string;
};

export type UmamiKeyCheck = {
  ok: boolean;
  status: number;
  message: string;
  endpoint: string;
  websiteCount?: number;
};

export async function checkUmamiApiKey(): Promise<UmamiKeyCheck> {
  const target = resolveUmamiTarget();
  const url = `${target.baseUrl.replace(/\/$/, "")}/websites`;
  const res = await fetch(url, { headers: umamiHeaders(target.auth), cache: "no-store" });
  const body = await res.text().catch(() => "");
  if (res.ok) {
    let websiteCount: number | undefined;
    try {
      const data = JSON.parse(body) as unknown;
      if (Array.isArray(data)) websiteCount = data.length;
    } catch {
      /* ignore */
    }
    return { ok: true, status: res.status, message: "API key accepted", endpoint: url, websiteCount };
  }
  let message = body.slice(0, 200);
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    if (parsed.error?.message) message = parsed.error.message;
  } catch {
    /* keep raw slice */
  }
  return { ok: false, status: res.status, message, endpoint: url };
}

export async function listUmamiWebsites(): Promise<UmamiWebsite[]> {
  const target = resolveUmamiTarget();
  const url = `${target.baseUrl.replace(/\/$/, "")}/websites`;
  const res = await fetch(url, { headers: umamiHeaders(target.auth), cache: "no-store" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Umami websites ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) return [];
  return data
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object"))
    .map((row) => ({
      id: String(row.id ?? ""),
      name: String(row.name ?? "Website"),
      domain: row.domain ? String(row.domain) : undefined,
    }))
    .filter((row) => row.id);
}

export async function fetchUmamiStats(
  websiteId: string,
  startAt: Date,
  endAt: Date,
): Promise<UmamiStatsPayload> {
  const target = resolveUmamiTarget();
  const url = new URL(websiteUrl(target.baseUrl, target.layout, websiteId, "stats"));
  url.searchParams.set("startAt", String(startAt.getTime()));
  url.searchParams.set("endAt", String(endAt.getTime()));

  const res = await fetch(url.toString(), { headers: umamiHeaders(target.auth), cache: "no-store" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Umami stats ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as UmamiStatsPayload;
}

export function trafficSnapshotDays(): number {
  const raw = process.env.TRAFFIC_SNAPSHOT_DAYS?.trim() || "30";
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 && n <= 90 ? n : 30;
}
