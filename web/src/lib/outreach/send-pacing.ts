import type { SupabaseClient } from "@supabase/supabase-js";
import { outreachLog } from "@/lib/outreach/logger";

export function getHourlySendLimit(): number {
  const raw = process.env.OUTREACH_HOURLY_SEND_LIMIT;
  const n = parseInt(raw ?? "30", 10);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

/** Rolling window (minutes) for send cap checks. Default 20. */
export function getSendWindowMinutes(): number {
  const raw = process.env.OUTREACH_SEND_WINDOW_MINUTES;
  const n = parseInt(raw ?? "20", 10);
  return Number.isFinite(n) && n > 0 ? n : 20;
}

export function sendJitterMs(): number {
  return 200 + Math.floor(Math.random() * 600);
}

export async function countSendsInWindow(
  sb: SupabaseClient,
  campaign: string,
): Promise<number> {
  const windowMs = getSendWindowMinutes() * 60 * 1000;
  const since = new Date(Date.now() - windowMs).toISOString();
  const { count, error } = await sb
    .from("outreach_prospects")
    .select("id", { count: "exact", head: true })
    .eq("campaign", campaign)
    .gte("updated_at", since)
    .in("status", ["sent", "bounced"]);

  if (error) {
    outreachLog({ level: "warn", event: "send_window_count_failed", campaign, issues: [error.message] });
    return 0;
  }
  return count ?? 0;
}

export async function canSendThisHour(
  sb: SupabaseClient,
  campaign: string,
): Promise<{ ok: boolean; reason?: string }> {
  const limit = getHourlySendLimit();
  const windowMinutes = getSendWindowMinutes();
  const count = await countSendsInWindow(sb, campaign);
  if (count >= limit) {
    return {
      ok: false,
      reason: `Send cap reached (${limit} per ${windowMinutes} min for ${campaign})`,
    };
  }
  return { ok: true };
}

export function isSmartSendEnabled(): boolean {
  return process.env.OUTREACH_SMART_SEND === "1";
}

/** Top UTC hours by clicks for campaign (optionally filtered by country). */
export async function getPreferredSendHours(
  sb: SupabaseClient,
  campaign: string,
  country = "INT",
): Promise<number[]> {
  const { data } = await sb
    .from("outreach_send_stats")
    .select("hour_utc, clicks, opens")
    .eq("campaign", campaign)
    .eq("country", country)
    .order("clicks", { ascending: false })
    .limit(5);

  if (!data?.length) {
    const { data: fallback } = await sb
      .from("outreach_send_stats")
      .select("hour_utc, clicks, opens")
      .eq("campaign", campaign)
      .order("clicks", { ascending: false })
      .limit(3);
    return (fallback ?? []).map((r) => r.hour_utc).filter((h) => typeof h === "number");
  }

  return data.map((r) => r.hour_utc).filter((h) => typeof h === "number");
}

/** Snap a target ISO timestamp to the next preferred UTC hour when smart send is on. */
export async function adjustSendTimeForSmartSend(
  sb: SupabaseClient,
  campaign: string,
  targetIso: string,
  country?: string | null,
): Promise<string> {
  if (!isSmartSendEnabled()) return targetIso;

  const bucket = country && country !== "all" ? country : "INT";
  const hours = await getPreferredSendHours(sb, campaign, bucket);
  if (!hours.length) return targetIso;

  const target = new Date(targetIso);
  const preferred = new Set(hours.slice(0, 2));

  for (let dayOffset = 0; dayOffset < 14; dayOffset += 1) {
    for (const hour of [...preferred].sort((a, b) => a - b)) {
      const candidate = new Date(target);
      candidate.setUTCDate(candidate.getUTCDate() + dayOffset);
      candidate.setUTCHours(hour, 15, 0, 0);
      if (candidate >= target) return candidate.toISOString();
    }
  }

  return targetIso;
}
