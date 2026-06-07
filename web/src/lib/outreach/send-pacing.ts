import type { SupabaseClient } from "@supabase/supabase-js";
import { outreachLog } from "@/lib/outreach/logger";

export function getHourlySendLimit(): number {
  const raw = process.env.OUTREACH_HOURLY_SEND_LIMIT;
  const n = parseInt(raw ?? "30", 10);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

export function sendJitterMs(): number {
  return 200 + Math.floor(Math.random() * 600);
}

export async function countSendsInLastHour(
  sb: SupabaseClient,
  campaign: string,
): Promise<number> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await sb
    .from("outreach_prospects")
    .select("id", { count: "exact", head: true })
    .eq("campaign", campaign)
    .gte("updated_at", since)
    .in("status", ["sent", "bounced"]);

  if (error) {
    outreachLog({ level: "warn", event: "hourly_send_count_failed", campaign, issues: [error.message] });
    return 0;
  }
  return count ?? 0;
}

export async function canSendThisHour(
  sb: SupabaseClient,
  campaign: string,
): Promise<{ ok: boolean; reason?: string }> {
  const limit = getHourlySendLimit();
  const count = await countSendsInLastHour(sb, campaign);
  if (count >= limit) {
    return { ok: false, reason: `Hourly send cap reached (${limit}/hour for ${campaign})` };
  }
  return { ok: true };
}
