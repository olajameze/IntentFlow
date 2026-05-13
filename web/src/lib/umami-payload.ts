/**
 * Normalise Umami `GET /api/websites/:id/stats` payloads.
 * v2 Cloud returns `{ pageviews: { value, change }, visitors: { value, change }, ... }`.
 * Older / wrapped shapes may use `totals.pageviews` or bare numbers.
 */

function numericMetric(raw: unknown): number {
  if (typeof raw === "number" && !Number.isNaN(raw)) return raw;
  if (raw && typeof raw === "object" && "value" in raw) {
    const v = (raw as { value: unknown }).value;
    if (typeof v === "number" && !Number.isNaN(v)) return v;
  }
  return 0;
}

export function umamiPageviewsFromPayload(payload: unknown): number {
  if (!payload || typeof payload !== "object") return 0;
  const p = payload as Record<string, unknown>;
  const totals = p.totals as Record<string, unknown> | undefined;
  if (totals?.pageviews !== undefined) return numericMetric(totals.pageviews);
  if (p.pageviews !== undefined) return numericMetric(p.pageviews);
  if (p.pageViews !== undefined) return numericMetric(p.pageViews);
  return 0;
}

export function umamiVisitorsFromPayload(payload: unknown): number {
  if (!payload || typeof payload !== "object") return 0;
  const p = payload as Record<string, unknown>;
  const totals = p.totals as Record<string, unknown> | undefined;
  if (totals?.visitors !== undefined) return numericMetric(totals.visitors);
  if (totals?.uniques !== undefined) return numericMetric(totals.uniques);
  if (p.visitors !== undefined) return numericMetric(p.visitors);
  if (p.uniques !== undefined) return numericMetric(p.uniques);
  return 0;
}
