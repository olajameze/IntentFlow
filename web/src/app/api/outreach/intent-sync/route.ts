import { NextResponse } from "next/server";
import { logTimelineEvent } from "@/lib/outreach/messages";
import { withSupabaseRoute } from "@/lib/with-supabase-route";

const UMAMI_URL = process.env.UMAMI_URL || process.env.NEXT_PUBLIC_UMAMI_URL || "https://cloud.umami.is";
const UMAMI_TOKEN = process.env.UMAMI_API_TOKEN || process.env.UMAMI_API_KEY;

/** POST — cron: ingest Umami website events and match outreach prospects via UTM p= */
export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  if (expected) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!UMAMI_TOKEN) {
    return NextResponse.json({ error: "UMAMI_API_TOKEN not set" }, { status: 503 });
  }

  return withSupabaseRoute(async (sb) => {
    const { data: businesses } = await sb
      .from("businesses")
      .select("id, umami_website_id")
      .not("umami_website_id", "is", null);

    let ingested = 0;
    const startAt = Date.now() - 24 * 60 * 60 * 1000;

    for (const biz of businesses ?? []) {
      const wid = biz.umami_website_id;
      if (!wid) continue;

      const res = await fetch(`${UMAMI_URL.replace(/\/$/, "")}/api/websites/${wid}/events?startAt=${startAt}&pageSize=100`, {
        headers: { Authorization: `Bearer ${UMAMI_TOKEN}`, "x-umami-api-key": UMAMI_TOKEN },
      }).catch(() => null);

      if (!res?.ok) continue;
      const json = (await res.json()) as { data?: { urlPath?: string; eventName?: string; urlQuery?: string }[] };
      const events = json.data ?? [];

      for (const ev of events) {
        const query = ev.urlQuery || "";
        const pMatch = query.match(/(?:^|&)?p=([0-9a-f-]{36})/i);
        if (!pMatch) continue;
        const prospectId = pMatch[1];

        await sb.from("outreach_email_events").insert({
          prospect_id: prospectId,
          campaign: "pesttrace",
          event_type: "site_intent",
          url: (ev.urlPath || "").slice(0, 1000),
        });

        await logTimelineEvent(sb, {
          prospectId,
          businessId: biz.id,
          eventType: "site_intent",
          title: `Site: ${ev.eventName || ev.urlPath || "visit"}`,
          detail: ev,
        });
        ingested += 1;
      }
    }

    return NextResponse.json({ ok: true, ingested });
  });
}

export const dynamic = "force-dynamic";
