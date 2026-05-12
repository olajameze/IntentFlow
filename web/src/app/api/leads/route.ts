import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const businessId = searchParams.get("business_id");
  const from = searchParams.get("from");
  const sb = getSupabaseAdmin();
  let query = sb.from("leads").select("*").order("created_at", { ascending: false }).limit(400);
  if (businessId) query = query.eq("business_id", businessId);
  if (from) query = query.gte("created_at", from);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
