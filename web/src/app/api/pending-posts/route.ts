import { NextResponse } from "next/server";
import { withSupabaseRoute } from "@/lib/with-supabase-route";
import { z } from "zod";

export async function GET(req: Request) {
  return withSupabaseRoute(async (sb) => {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") ?? "pending";
    const businessId = searchParams.get("business_id");
    let query = sb.from("pending_posts").select("*").order("created_at", { ascending: false }).limit(200);
    if (status) query = query.eq("status", status);
    if (businessId) query = query.eq("business_id", businessId);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  });
}

const updateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["approved", "rejected"]),
});

export async function PATCH(req: Request) {
  const json = await req.json();
  const parsed = updateSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  return withSupabaseRoute(async (sb) => {
    const { data, error } = await sb
      .from("pending_posts")
      .update({ status: parsed.data.status, updated_at: new Date().toISOString() })
      .eq("id", parsed.data.id)
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  });
}
