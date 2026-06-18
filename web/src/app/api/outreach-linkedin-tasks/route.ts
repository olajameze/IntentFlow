import { NextResponse } from "next/server";
import { withSupabaseRoute } from "@/lib/with-supabase-route";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "pending";
  const campaign = searchParams.get("campaign")?.trim().toLowerCase();
  return withSupabaseRoute(async (sb) => {
    const q = sb
      .from("outreach_linkedin_tasks")
      .select("*, outreach_prospects(name, email, campaign, website_url)")
      .eq("status", status)
      .order("due_at", { ascending: true })
      .limit(100);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const rows = (data ?? []).filter(
      (t) => !campaign || campaign === "all" || t.outreach_prospects?.campaign === campaign,
    );
    return NextResponse.json(rows);
  });
}

export async function PATCH(req: Request) {
  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  return withSupabaseRoute(async (sb) => {
    const { data, error } = await sb
      .from("outreach_linkedin_tasks")
      .update({ status: body.status, updated_at: new Date().toISOString() })
      .eq("id", body.id)
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  });
}

export const dynamic = "force-dynamic";
