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
      if (message.includes("outreach_campaign_stats")) {
        return NextResponse.json(
          {
            error: "Stats function not installed — run outreach migrations",
            hint: "POST /api/setup/apply-outreach-migration or node scripts/setup-marketing-conversion.mjs",
          },
          { status: 503 },
        );
      }
      return supabaseErrorResponse(err instanceof Error ? err : new Error(message));
    }
  });
}
