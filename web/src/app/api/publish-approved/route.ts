import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function POST(req: Request) {
  const body = await req.json();
  const id = body.id as string | undefined;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const sb = getSupabaseAdmin();
  const { data: post, error } = await sb.from("pending_posts").select("*").eq("id", id).single();
  if (error || !post) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (post.status !== "approved") {
    return NextResponse.json({ error: "Post must be approved first" }, { status: 400 });
  }

  // Production: call Facebook Graph / LinkedIn UGC APIs using tokens from social_accounts.
  // This stub marks the post as published for traceability.
  await sb
    .from("pending_posts")
    .update({ status: "published", updated_at: new Date().toISOString() })
    .eq("id", id);

  return NextResponse.json({ ok: true, note: "Published (stub — wire platform APIs + vault tokens)." });
}
