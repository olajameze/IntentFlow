import { NextResponse } from "next/server";
import { withSupabaseRoute } from "@/lib/with-supabase-route";

/** GET /api/outreach-prospects/funnel?campaign=pesttrace */
export async function GET(req: Request) {
  const campaign = new URL(req.url).searchParams.get("campaign")?.trim().toLowerCase() || "pesttrace";

  return withSupabaseRoute(async (sb) => {
    const base = () =>
      sb.from("outreach_prospects").select("id", { count: "exact", head: true }).eq("campaign", campaign);

    const [{ count: sent }, { count: opened }, { count: clicked }, { count: booked }] = await Promise.all([
      base().not("sent_at", "is", null),
      base().not("opened_at", "is", null),
      base().not("clicked_at", "is", null),
      base().not("booked_at", "is", null),
    ]);

    const { count: snapshotViews } = await sb
      .from("outreach_email_events")
      .select("id", { count: "exact", head: true })
      .eq("campaign", campaign)
      .eq("event_type", "snapshot_view");

    const { count: trials } = await sb
      .from("outreach_conversion_receipts")
      .select("id", { count: "exact", head: true })
      .eq("event_type", "trial_started");

    const { count: converted } = await sb
      .from("outreach_prospects")
      .select("id", { count: "exact", head: true })
      .eq("campaign", campaign)
      .not("converted_at", "is", null);

    return NextResponse.json({
      campaign,
      stages: [
        { key: "sent", label: "Sent", count: sent ?? 0 },
        { key: "opened", label: "Opened", count: opened ?? 0 },
        { key: "clicked", label: "Clicked", count: clicked ?? 0 },
        { key: "snapshot_view", label: "Snapshot viewed", count: snapshotViews ?? 0 },
        { key: "trial_started", label: "Trial started", count: trials ?? 0 },
        { key: "converted", label: "Converted", count: converted ?? 0 },
        { key: "booked", label: "Booked", count: booked ?? 0 },
      ],
    });
  });
}

export const dynamic = "force-dynamic";
