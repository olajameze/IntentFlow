import { NextResponse } from "next/server";
import { checkUmamiApiKey, listUmamiWebsites, trafficSnapshotDays, fetchUmamiStats } from "@/lib/umami-client";
import { withSupabaseRoute } from "@/lib/with-supabase-route";

/**
 * POST /api/umami-sync
 * Pull live Umami stats for each active business and insert analytics_snapshots rows.
 */
export async function POST() {
  return withSupabaseRoute(async (sb) => {
    const hasKey = Boolean(
      (process.env.UMAMI_API_KEY || process.env.UMAMI_API_TOKEN || "").trim(),
    );
    const hasUrl = Boolean(
      (process.env.UMAMI_URL || process.env.NEXT_PUBLIC_UMAMI_URL || "").trim(),
    );
    if (!hasKey || !hasUrl) {
      return NextResponse.json(
        {
          error: "Umami not configured",
          hint:
            "Set NEXT_PUBLIC_UMAMI_URL=https://cloud.umami.is, UMAMI_API_TOKEN (Cloud API key), and UMAMI_CLOUD_REGION=eu in web/.env.local.",
        },
        { status: 503 },
      );
    }

    const { data: businesses, error: bizErr } = await sb
      .from("businesses")
      .select("id, name, umami_website_id")
      .eq("active", true);

    if (bizErr) {
      return NextResponse.json({ error: bizErr.message }, { status: 500 });
    }

    const end = new Date();
    const days = trafficSnapshotDays();
    const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
    const capturedAt = end.toISOString();

    const results: { name: string; ok: boolean; detail?: string }[] = [];

    for (const biz of businesses ?? []) {
      const wid = (biz.umami_website_id as string | null)?.trim();
      if (!wid) {
        results.push({ name: String(biz.name), ok: false, detail: "no umami_website_id" });
        continue;
      }
      try {
        const stats = await fetchUmamiStats(wid, start, end);
        const { error: insErr } = await sb.from("analytics_snapshots").insert({
          business_id: biz.id,
          source: "umami",
          website_id: wid,
          payload: {
            ...stats,
            window_days: days,
            window_start: start.toISOString(),
            window_end: end.toISOString(),
          },
          captured_at: capturedAt,
        });
        if (insErr) {
          results.push({ name: String(biz.name), ok: false, detail: insErr.message });
        } else {
          results.push({ name: String(biz.name), ok: true });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Umami fetch failed";
        const hint =
          msg.includes("401") ?
            "Umami rejected the API key. In Cloud → Settings → API keys, create a new key and set UMAMI_API_TOKEN in web/.env.local (and GitHub secret UMAMI_API_TOKEN)."
          : undefined;
        results.push({ name: String(biz.name), ok: false, detail: hint ? `${msg}. ${hint}` : msg });
      }
    }

    const synced = results.filter((r) => r.ok).length;
    return NextResponse.json({
      ok: synced > 0,
      synced,
      windowDays: days,
      capturedAt,
      results,
    });
  });
}

export async function GET() {
  const hasKey = Boolean(
    (process.env.UMAMI_API_KEY || process.env.UMAMI_API_TOKEN || "").trim(),
  );
  const hasUrl = Boolean(
    (process.env.UMAMI_URL || process.env.NEXT_PUBLIC_UMAMI_URL || "").trim(),
  );
  if (!hasKey || !hasUrl) {
    return NextResponse.json({
      configured: false,
      keyValid: false,
      cloudRegion: process.env.UMAMI_CLOUD_REGION?.trim() || null,
      windowDays: trafficSnapshotDays(),
      hint:
        "Set UMAMI_URL=https://cloud.umami.is, UMAMI_CLOUD_REGION=eu, and UMAMI_API_KEY (Cloud → Settings → API keys) in web/.env.local.",
    });
  }

  const keyCheck = await checkUmamiApiKey();
  let websites: { id: string; name: string; domain?: string }[] = [];
  if (keyCheck.ok) {
    try {
      websites = await listUmamiWebsites();
    } catch {
      /* list failed after key check succeeded — still report keyValid */
    }
  }

  return NextResponse.json({
    configured: true,
    keyValid: keyCheck.ok,
    keyStatus: keyCheck.status,
    keyMessage: keyCheck.message,
    apiEndpoint: keyCheck.endpoint,
    websiteCount: keyCheck.websiteCount ?? websites.length,
    websites: websites.map((w) => ({ id: w.id, name: w.name, domain: w.domain ?? null })),
    cloudRegion: process.env.UMAMI_CLOUD_REGION?.trim() || null,
    windowDays: trafficSnapshotDays(),
    hint:
      keyCheck.ok ?
        undefined
      : "Umami returned “Invalid API key”. Open Cloud → Settings → API keys, reveal or create a key, and paste the full value into UMAMI_API_KEY in web/.env.local (not a browser login JWT). Restart `npm run dev` after saving.",
  });
}
