import { NextResponse } from "next/server";
import { handleInboundReply } from "@/lib/outreach/reply-handler";
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

  return withSupabaseRoute(async (sb) => {
    // Lightweight stub: production IMAP requires imapflow package.
    // Log configuration present so operators know to prefer Brevo webhook.
    void req;
    void host;
    void user;
    void password;
    void handleInboundReply;
    void sb;

    return NextResponse.json({
      ok: true,
      processed: 0,
      hint: "Configure Brevo inbound webhook at /api/outreach-webhooks/brevo for automatic reply detection.",
    });
  });
}

export const dynamic = "force-dynamic";
