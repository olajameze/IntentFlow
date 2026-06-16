import { NextResponse } from "next/server";
import { syncProspectToHubSpot, testHubSpotConnection } from "@/lib/integrations/hubspot";
import { withSupabaseRoute } from "@/lib/with-supabase-route";

export async function GET() {
  const result = await testHubSpotConnection();
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}

/** POST { prospect_id? } — sync one or batch recent prospects */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { prospect_id?: string; limit?: number };

  return withSupabaseRoute(async (sb) => {
    if (body.prospect_id) {
      const { data: p } = await sb.from("outreach_prospects").select("*").eq("id", body.prospect_id).maybeSingle();
      if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const r = await syncProspectToHubSpot(sb, p);
      return NextResponse.json(r);
    }

    const limit = Math.min(body.limit ?? 25, 100);
    const { data: rows } = await sb
      .from("outreach_prospects")
      .select("*")
      .not("replied_at", "is", null)
      .order("updated_at", { ascending: false })
      .limit(limit);

    const results = [];
    for (const p of rows ?? []) {
      results.push(await syncProspectToHubSpot(sb, p));
    }
    return NextResponse.json({ synced: results.length, results });
  });
}

export const dynamic = "force-dynamic";
