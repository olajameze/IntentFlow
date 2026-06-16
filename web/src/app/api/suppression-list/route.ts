import { NextResponse } from "next/server";
import { addToSuppressionList } from "@/lib/outreach/suppression";
import { withSupabaseRoute } from "@/lib/with-supabase-route";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim().toLowerCase();
  return withSupabaseRoute(async (sb) => {
    let query = sb.from("suppression_list").select("*").order("created_at", { ascending: false }).limit(500);
    if (q) query = query.ilike("email", `%${q}%`);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  });
}

export async function POST(req: Request) {
  const body = await req.json();
  const email = String(body.email || "").trim();
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });
  return withSupabaseRoute(async (sb) => {
    await addToSuppressionList(sb, email, body.reason || "manual", body.campaign);
    return NextResponse.json({ ok: true });
  });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  return withSupabaseRoute(async (sb) => {
    const { error } = await sb.from("suppression_list").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  });
}

export const dynamic = "force-dynamic";
