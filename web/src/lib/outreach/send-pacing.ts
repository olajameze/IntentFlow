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
