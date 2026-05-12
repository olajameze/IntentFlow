import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const businessId = searchParams.get("business_id");
  const sb = getSupabaseAdmin();
  let query = sb.from("analytics_snapshots").select("*").order("captured_at", { ascending: false }).limit(500);
  if (businessId) query = query.eq("business_id", businessId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
