import { NextResponse } from "next/server";
import { supabaseErrorResponse } from "@/lib/supabase-error-response";
import { withSupabaseRoute } from "@/lib/with-supabase-route";

export async function GET(req: Request) {
  return withSupabaseRoute(async (sb) => {
    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("business_id");
    let query = sb.from("revenue_snapshots").select("*").order("snapshot_date", { ascending: false }).limit(400);
    if (businessId) query = query.eq("business_id", businessId);
    const { data, error } = await query;
    if (error) return supabaseErrorResponse(error);
    return NextResponse.json(data ?? []);
  });
}
