import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getPublicBaseUrl } from "@/lib/outreach/public-base-url";
import { parseSnapshotPayloadByCampaign } from "@/lib/outreach/snapshot-types";
import { isSnapshotToken, recordSnapshotView } from "@/lib/outreach/snapshot-view";
import { CampaignSnapshotView, snapshotPageTitle } from "./snapshot-views";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Props = { params: { token: string } };

const VALID_CAMPAIGNS = new Set(["pesttrace", "weathers", "jgdevs"]);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const token = params.token?.trim() ?? "";
  if (!isSnapshotToken(token)) return { title: "Snapshot not found" };
  try {
    const sb = getSupabaseAdmin();
    const { data: row } = await sb
      .from("outreach_snapshots")
      .select("campaign, payload")
      .eq("token", token)
      .maybeSingle();
    if (row?.campaign && VALID_CAMPAIGNS.has(row.campaign)) {
      const parsed = parseSnapshotPayloadByCampaign(row.campaign, row.payload);
      if (parsed) return { title: snapshotPageTitle(parsed) };
    }
  } catch {
    /* ignore */
  }
  return { title: "Outreach snapshot" };
}

export default async function SnapshotPage({ params }: Props) {
  const token = params.token?.trim() ?? "";
  if (!isSnapshotToken(token)) notFound();

  const sb = getSupabaseAdmin();
  const { data: row, error } = await sb
    .from("outreach_snapshots")
    .select("prospect_id, campaign, payload, overall_score")
    .eq("token", token)
    .maybeSingle();

  if (error || !row || !VALID_CAMPAIGNS.has(row.campaign)) notFound();

  const parsed = parseSnapshotPayloadByCampaign(row.campaign, row.payload);
  if (!parsed) notFound();

  const viewMeta = await recordSnapshotView(sb, token);
  const prospectId = viewMeta?.prospectId ?? row.prospect_id;
  const baseUrl = getPublicBaseUrl();

  return (
    <CampaignSnapshotView parsed={parsed} prospectId={prospectId} baseUrl={baseUrl} />
  );
}
