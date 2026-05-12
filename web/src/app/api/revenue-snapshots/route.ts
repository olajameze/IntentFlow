import { NextResponse } from "next/server";
import { withSupabaseRoute } from "@/lib/with-supabase-route";

export async function GET(req: Request) {
  return withSupabaseRoute(async (sb) => {
    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("business_id");
    let query = sb.from("revenue_snapshots").select("*").order("snapshot_date", { ascending: false }).limit(400);
    if (businessId) query = query.eq("business_id", businessId);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  });
}
