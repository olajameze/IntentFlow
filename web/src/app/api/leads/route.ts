import { NextResponse } from "next/server";
import { supabaseErrorResponse } from "@/lib/supabase-error-response";
import { withSupabaseRoute } from "@/lib/with-supabase-route";

export async function GET(req: Request) {
  return withSupabaseRoute(async (sb) => {
    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("business_id");
    const from = searchParams.get("from");
    let query = sb.from("leads").select("*").order("created_at", { ascending: false }).limit(400);
    if (businessId) query = query.eq("business_id", businessId);
    if (from) query = query.gte("created_at", from);
    const { data, error } = await query;
    if (error) return supabaseErrorResponse(error);
    return NextResponse.json(data ?? []);
  });
}
