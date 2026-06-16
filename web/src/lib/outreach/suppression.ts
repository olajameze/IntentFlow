import type { SupabaseClient } from "@supabase/supabase-js";

export type SuppressionReason = "unsubscribe" | "bounce" | "complaint" | "manual";

/** Check suppression before send — global or campaign-specific. */
export async function checkSuppressionBeforeSend(
  sb: SupabaseClient,
  email: string,
  campaign: string,
): Promise<{ blocked: boolean; reason?: string }> {
  const normalized = email.trim().toLowerCase();
  const { data: rows } = await sb
    .from("suppression_list")
    .select("reason, campaign")
    .ilike("email", normalized);

  if (!rows?.length) return { blocked: false };

  const hit = rows.find(
    (r) => !r.campaign || r.campaign === "all" || r.campaign === campaign,
  );
  if (hit) return { blocked: true, reason: hit.reason };
  return { blocked: false };
}

export async function addToSuppressionList(
  sb: SupabaseClient,
  email: string,
  reason: SuppressionReason,
  campaign?: string | null,
): Promise<void> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return;

  const { data: existing } = await sb
    .from("suppression_list")
    .select("id")
    .eq("email", normalized)
    .eq("campaign", campaign ?? null)
    .maybeSingle();

  if (existing) return;

  await sb.from("suppression_list").insert({
    email: normalized,
    reason,
    campaign: campaign ?? null,
  });
}
