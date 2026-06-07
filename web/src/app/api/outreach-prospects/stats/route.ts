import { NextResponse } from "next/server";
import { getCachedCampaignStats } from "@/lib/outreach/campaign-stats";
import { supabaseErrorResponse } from "@/lib/supabase-error-response";
import { withSupabaseRoute } from "@/lib/with-supabase-route";

/** GET /api/outreach-prospects/stats?campaign=pesttrace */
export async function GET(req: Request) {
  return withSupabaseRoute(async (sb) => {
    const { searchParams } = new URL(req.url);
    const campaign = (searchParams.get("campaign") || "pesttrace").trim().toLowerCase();

    try {
      void sb;
      const stats = await getCachedCampaignStats(campaign);
      return NextResponse.json(stats, {
        headers: {
          "Cache-Control": "private, max-age=15, stale-while-revalidate=30",
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Stats query failed";
      const { fetchCampaignStatsFallback, isStatsRpcMissingError } = await import(
        "@/lib/outreach/campaign-stats-fallback"
      );
      if (isStatsRpcMissingError(err)) {
        try {
          const stats = await fetchCampaignStatsFallback(sb, campaign);
          return NextResponse.json(
            { ...stats, degraded: true, hint: "Apply outreach migrations for faster stats RPC" },
            {
              headers: {
                "Cache-Control": "private, max-age=15, stale-while-revalidate=30",
              },
            },
          );
        } catch (fallbackErr) {
          return supabaseErrorResponse(
            fallbackErr instanceof Error ? fallbackErr : new Error(String(fallbackErr)),
          );
        }
      }
      return supabaseErrorResponse(err instanceof Error ? err : new Error(message));
    }
  });
}
