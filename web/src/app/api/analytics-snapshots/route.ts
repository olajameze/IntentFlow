import { NextResponse } from "next/server";
import { withSupabaseRoute } from "@/lib/with-supabase-route";

export async function GET(req: Request) {
  return withSupabaseRoute(async (sb) => {
    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("business_id");
    let query = sb
      .from("analytics_snapshots")
      .select("*")
      .order("captured_at", { ascending: false })
      .limit(500);
    if (businessId) query = query.eq("business_id", businessId);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  });
}
