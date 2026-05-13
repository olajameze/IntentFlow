import { NextResponse } from "next/server";
import { withSupabaseRoute } from "@/lib/with-supabase-route";
import { publishFacebookPagePost, resolveFacebookCredentialsForBusiness } from "@/lib/facebook-publish";

export async function POST(req: Request) {
  const body = await req.json();
  const id = body.id as string | undefined;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  return withSupabaseRoute(async (sb) => {
    const { data: post, error } = await sb.from("pending_posts").select("*").eq("id", id).single();
    if (error || !post) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (post.status !== "approved") {
      return NextResponse.json({ error: "Post must be approved first" }, { status: 400 });
    }

    const bizId = String(post.business_id);
    const platform = String(post.platform || "").toLowerCase();
    const content = String(post.content ?? "");

    if (platform === "facebook") {
      const creds = resolveFacebookCredentialsForBusiness(bizId);
      if (!creds) {
        return NextResponse.json(
          {
            error:
              "Facebook credentials not configured. Set FACEBOOK_PAGE_ID + FACEBOOK_PAGE_ACCESS_TOKEN, or FACEBOOK_BUSINESS_ID_N with matching FACEBOOK_PAGE_ID_N / FACEBOOK_PAGE_ACCESS_TOKEN_N.",
          },
          { status: 400 }
        );
      }
      const published = await publishFacebookPagePost(creds.pageId, creds.token, content);
      if (!published.ok) {
        return NextResponse.json(
          { error: published.error, graph_status: published.status },
          { status: 502 }
        );
      }
      await sb
        .from("pending_posts")
        .update({ status: "published", updated_at: new Date().toISOString() })
        .eq("id", id);
      return NextResponse.json({ ok: true, facebook_post_id: published.postId });
    }

    await sb
      .from("pending_posts")
      .update({ status: "published", updated_at: new Date().toISOString() })
      .eq("id", id);

    return NextResponse.json({
      ok: true,
      note:
        platform === "linkedin"
          ? "Marked published in dashboard; wire LinkedIn UGC API for automated posting."
          : `Marked published locally (${platform}); add a platform integration to push externally.`,
    });
  });
}
