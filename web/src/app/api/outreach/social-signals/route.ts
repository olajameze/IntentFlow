import { NextResponse } from "next/server";
import { withSupabaseRoute } from "@/lib/with-supabase-route";

/** GET pending social listen prospects; POST approve into pipeline */
export async function GET() {
  return withSupabaseRoute(async (sb) => {
    const { data, error } = await sb
      .from("outreach_prospects")
      .select("*")
      .eq("source", "social_listen")
      .eq("status", "scraped")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  });
}

/** POST { action: "import_csv", rows: [...] } or engine webhook */
export async function POST(req: Request) {
  const body = await req.json();
  if (body.action === "approve" && body.id) {
    return withSupabaseRoute(async (sb) => {
      const { data, error } = await sb
        .from("outreach_prospects")
        .update({ status: "draft_ready", updated_at: new Date().toISOString() })
        .eq("id", body.id)
        .select("*")
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(data);
    });
  }

  const rows = (body.rows as { name?: string; email?: string; website_url?: string; campaign?: string }[]) ?? [];
  return withSupabaseRoute(async (sb) => {
    let inserted = 0;
    for (const row of rows) {
      if (!row.email) continue;
      const { error } = await sb.from("outreach_prospects").insert({
        name: row.name || row.email.split("@")[0],
        email: row.email.toLowerCase(),
        website_url: row.website_url,
        campaign: row.campaign || "jgdevs",
        source: "social_listen",
        status: "scraped",
      });
      if (!error) inserted += 1;
    }
    return NextResponse.json({ ok: true, inserted });
  });
}

export const dynamic = "force-dynamic";
