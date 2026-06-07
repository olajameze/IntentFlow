import { NextResponse } from "next/server";
import { pollImapReplies } from "@/lib/outreach/imap-reply";
import { withSupabaseRoute } from "@/lib/with-supabase-route";

/**
 * POST — IMAP fallback poll for replies (cron). Requires OUTREACH_REPLY_IMAP_* env vars.
 * Primary path is Brevo inbound webhook.
 */
export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  if (expected) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const host = process.env.OUTREACH_REPLY_IMAP_HOST?.trim();
  const user = process.env.OUTREACH_REPLY_IMAP_USER?.trim();
  const password = process.env.OUTREACH_REPLY_IMAP_PASSWORD?.trim();

  if (!host || !user || !password) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      message: "IMAP not configured — use Brevo inbound webhook instead.",
    });
  }

  void req;

  return withSupabaseRoute(async (sb) => {
    try {
      const result = await pollImapReplies(sb, { host, user, password });
      return NextResponse.json({ ok: true, ...result });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
  });
}

export const dynamic = "force-dynamic";
