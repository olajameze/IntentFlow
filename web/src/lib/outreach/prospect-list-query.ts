import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

export type ProspectListParams = {
  status?: string | null;
  country?: string | null;
  campaign?: string | null;
  hotOnly?: boolean;
  engagementTier?: string | null;
  fullFields?: boolean;
};

/** Full summary — requires intelligence migration (20260607+). */
const SUMMARY_FULL =
  "id,name,email,phone,website_url,city,country,sector,campaign,status,source,business_id,email_subject,email_subject_b,lead_score,engagement_tier,subject_variant,sent_at,opened_at,clicked_at,replied_at,booked_at,delivered_at,interested_at,meeting_booked_at,converted_at,followup_count,sequence_step,next_send_at,open_count,click_count,created_at,updated_at,raw";

/** Without lead_score / delivered_at / sequence_step (pre-20260607). */
const SUMMARY_LEGACY =
  "id,name,email,phone,website_url,city,country,sector,campaign,status,source,business_id,email_subject,email_subject_b,engagement_tier,subject_variant,sent_at,opened_at,clicked_at,replied_at,booked_at,followup_count,next_send_at,open_count,click_count,created_at,updated_at,raw";

/** Pre business-outreach engagement tier (pre-20260604). */
const SUMMARY_BASE =
  "id,name,email,phone,website_url,city,country,sector,campaign,status,source,business_id,email_subject,email_subject_b,sent_at,opened_at,clicked_at,replied_at,booked_at,followup_count,next_send_at,open_count,click_count,created_at,updated_at,raw";

type SchemaTier = "full" | "legacy" | "base";

function isMissingColumnError(error: PostgrestError): boolean {
  const msg = error.message.toLowerCase();
  return (
    msg.includes("does not exist") ||
    msg.includes("could not find") ||
    error.code === "42703" ||
    error.code === "PGRST204"
  );
}

function tierColumns(tier: SchemaTier, fullFields: boolean): string {
  if (fullFields) return "*";
  if (tier === "full") return SUMMARY_FULL;
  if (tier === "legacy") return SUMMARY_LEGACY;
  return SUMMARY_BASE;
}

function applyFilters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  params: ProspectListParams,
  tier: SchemaTier,
) {
  const { status, country, campaign, hotOnly, engagementTier } = params;

  if (hotOnly) {
    if (tier !== "base") {
      query = query
        .eq("engagement_tier", "hot")
        .eq("status", "sent")
        .is("booked_at", null)
        .order("click_count", { ascending: false });
      if (tier === "full") {
        query = query.order("lead_score", { ascending: false });
      }
    } else {
      query = query
        .eq("status", "sent")
        .is("booked_at", null)
        .gt("click_count", 0)
        .order("click_count", { ascending: false });
    }
  } else if (status === "draft_ready" || status === "approved") {
    if (tier === "full") {
      query = query.order("lead_score", { ascending: false }).order("created_at", { ascending: false });
    } else {
      query = query.order("created_at", { ascending: false });
    }
  } else if (status === "sent") {
    if (tier === "full") {
      query = query.order("lead_score", { ascending: false }).order("click_count", { ascending: false });
    } else {
      query = query.order("click_count", { ascending: false }).order("created_at", { ascending: false });
    }
  } else {
    query = query.order("created_at", { ascending: false });
  }

  query = query.limit(200);
  if (status) query = query.eq("status", status);
  if (country) query = query.eq("country", country.toUpperCase());
  if (campaign) query = query.eq("campaign", campaign.trim().toLowerCase());
  if (engagementTier && ["cold", "warm", "hot"].includes(engagementTier) && tier !== "base") {
    query = query.eq("engagement_tier", engagementTier);
  }

  return query;
}

export async function queryOutreachProspects(
  sb: SupabaseClient,
  params: ProspectListParams,
): Promise<{ data: Record<string, unknown>[]; tier: SchemaTier }> {
  const tiers: SchemaTier[] = ["full", "legacy", "base"];
  let lastError: PostgrestError | null = null;

  for (const tier of tiers) {
    const columns = tierColumns(tier, Boolean(params.fullFields));
    let query = sb.from("outreach_prospects").select(columns);
    query = applyFilters(query, params, tier);
    const { data, error } = await query;
    if (!error) {
      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      if (tier !== "full") {
        for (const row of rows) {
          if (row.lead_score === undefined) row.lead_score = 0;
          if (row.engagement_tier === undefined) {
            row.engagement_tier =
              Number(row.click_count ?? 0) > 0 ? "hot" : "cold";
          }
          if (row.delivered_at === undefined) row.delivered_at = null;
          if (row.sequence_step === undefined) row.sequence_step = row.followup_count ?? 0;
        }
      }
      return { data: rows, tier };
    }
    if (isMissingColumnError(error)) {
      lastError = error;
      continue;
    }
    throw error;
  }

  throw lastError ?? new Error("Prospect list query failed");
}
