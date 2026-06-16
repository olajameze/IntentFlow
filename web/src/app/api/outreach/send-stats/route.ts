import { NextResponse } from "next/server";
import { withSupabaseRoute } from "@/lib/with-supabase-route";

/** POST — aggregate open/click hours for smart send (cron nightly) */
export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  if (expected) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  return withSupabaseRoute(async (sb) => {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: events, error } = await sb
      .from("outreach_email_events")
      .select("campaign, event_type, occurred_at")
      .in("event_type", ["open", "click"])
      .gte("occurred_at", since);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const buckets = new Map<string, { opens: number; clicks: number }>();
    for (const e of events ?? []) {
      const d = new Date(e.occurred_at);
      const key = `${e.campaign}|INT|${d.getUTCHours()}|${d.getUTCDay()}`;
      const cur = buckets.get(key) ?? { opens: 0, clicks: 0 };
      if (e.event_type === "open") cur.opens += 1;
      if (e.event_type === "click") cur.clicks += 1;
      buckets.set(key, cur);
    }

    let upserted = 0;
    for (const [key, counts] of buckets) {
      const [campaign, country, hour, dow] = key.split("|");
      await sb.from("outreach_send_stats").upsert(
        {
          campaign,
          country,
          hour_utc: Number(hour),
          dow: Number(dow),
          opens: counts.opens,
          clicks: counts.clicks,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "campaign,country,hour_utc,dow" },
      );
      upserted += 1;
    }

    return NextResponse.json({ ok: true, upserted });
  });
}

/** GET best hours for campaign */
export async function GET(req: Request) {
  const campaign = new URL(req.url).searchParams.get("campaign") || "pesttrace";
  return withSupabaseRoute(async (sb) => {
    const { data } = await sb
      .from("outreach_send_stats")
      .select("*")
      .eq("campaign", campaign)
      .order("clicks", { ascending: false })
      .limit(5);
    return NextResponse.json(data ?? []);
  });
}

export const dynamic = "force-dynamic";
