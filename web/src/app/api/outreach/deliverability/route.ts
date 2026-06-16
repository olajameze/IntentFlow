import { NextResponse } from "next/server";
import { withSupabaseRoute } from "@/lib/with-supabase-route";

/** GET /api/outreach/deliverability?campaign= */
export async function GET(req: Request) {
  const campaign = new URL(req.url).searchParams.get("campaign")?.trim().toLowerCase();

  return withSupabaseRoute(async (sb) => {
    let pq = sb.from("outreach_prospects").select("id, status, delivered_at, sent_at");
    if (campaign && campaign !== "all") pq = pq.eq("campaign", campaign);
    const { data: prospects, error } = await pq;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = prospects ?? [];
    const sent = rows.filter((r) => r.sent_at).length;
    const delivered = rows.filter((r) => r.delivered_at).length;
    const bounced = rows.filter((r) => r.status === "bounced").length;
    const unsubscribed = rows.filter((r) => r.status === "unsubscribed").length;
    const inboxPending = rows.filter((r) => r.sent_at && !r.delivered_at && r.status === "sent").length;

    const deliveryRate = sent ? delivered / sent : 0;
    const bounceRate = sent ? bounced / sent : 0;

    if (bounceRate > 0.03 && sent >= 10) {
      const { sendOutreachAlerts } = await import("@/lib/outreach/send-alert");
      await sendOutreachAlerts(sb, "bounce_rate_high", {
        campaign: campaign || "all",
        extra: `Bounce rate ${(bounceRate * 100).toFixed(1)}% (${bounced}/${sent} sent)`,
      });
    }

    return NextResponse.json({
      campaign: campaign || "all",
      sent,
      delivered,
      bounced,
      unsubscribed,
      inbox_pending: inboxPending,
      delivery_rate: deliveryRate,
      bounce_rate: bounceRate,
      spam_rate: 0,
      verify_failed: rows.filter((r) => r.status === "bounced").length,
    });
  });
}

export const dynamic = "force-dynamic";
