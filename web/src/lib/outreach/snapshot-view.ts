import type { SupabaseClient } from "@supabase/supabase-js";
import { invalidateOutreachStats } from "@/lib/outreach/campaign-stats";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isSnapshotToken(value: string): boolean {
  return UUID_RE.test(value.trim());
}

/** Record a snapshot page view and return prospect id for CTA tracking. */
export async function recordSnapshotView(
  sb: SupabaseClient,
  token: string,
): Promise<{ prospectId: string; campaign: string } | null> {
  if (!isSnapshotToken(token)) return null;

  const { data: row, error } = await sb
    .from("outreach_snapshots")
    .select("id, prospect_id, campaign, view_count, first_viewed_at")
    .eq("token", token)
    .maybeSingle();

  if (error || !row) return null;

  const now = new Date().toISOString();
  const viewCount = (row.view_count ?? 0) + 1;

  await sb
    .from("outreach_snapshots")
    .update({
      view_count: viewCount,
      first_viewed_at: row.first_viewed_at ?? now,
      updated_at: now,
    })
    .eq("id", row.id);

  await sb.from("outreach_email_events").insert({
    prospect_id: row.prospect_id,
    campaign: row.campaign,
    event_type: "snapshot_view",
  });

  invalidateOutreachStats(row.campaign);

  return { prospectId: row.prospect_id, campaign: row.campaign };
}

export function pesttraceTrialUrl(prospectId: string): string {
  const base = "https://pesttrace.com/";
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}utm_source=outreach&utm_medium=snapshot&utm_campaign=pesttrace&p=${encodeURIComponent(prospectId)}`;
}

export function trackedClickUrl(prospectId: string, destination: string, baseUrl: string): string {
  const origin = baseUrl.replace(/\/$/, "");
  return `${origin}/api/outreach-track/click?p=${encodeURIComponent(prospectId)}&to=${encodeURIComponent(destination)}`;
}

export function scoreBand(score: number): "red" | "amber" | "green" {
  if (score < 50) return "red";
  if (score < 70) return "amber";
  return "green";
}

export const SCORE_BAND_COLORS = {
  red: "#dc2626",
  amber: "#d97706",
  green: "#059669",
} as const;
