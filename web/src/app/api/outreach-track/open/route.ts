import { engagementUpdateFields } from "@/lib/outreach/engagement";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

/**
 * GET /api/outreach-track/open?p=<prospect_id>
 *
 * 1×1 transparent GIF endpoint embedded in every outreach email's HTML at send time.
 * Records an "open" event in ``outreach_email_events``, sets ``opened_at`` on the first
 * hit, and increments ``open_count`` for every load.
 *
 * Klaviyo step 9: track open rate. Note the iOS-15 caveat — Apple Mail pre-fetches the
 * pixel, so we filter Apple Mail prefetch hits out of ``open_count`` to avoid inflating
 * the metric. Click events from /click below are the more reliable conversion signal.
 *
 * Always returns 200 + a transparent GIF, even on lookup failure, so we never broadcast
 * "this is a tracked email" by serving an error.
 */
const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==",
  "base64",
);

const GIF_HEADERS: HeadersInit = {
  "Content-Type": "image/gif",
  "Cache-Control": "no-store, no-cache, must-revalidate, private",
  Pragma: "no-cache",
};

function pixelResponse() {
  return new Response(TRANSPARENT_GIF, { status: 200, headers: GIF_HEADERS });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const prospectId = (searchParams.get("p") || "").trim();

  if (!prospectId || !/^[0-9a-f-]{36}$/i.test(prospectId)) return pixelResponse();

  // Best-effort logging — tracking failures must NEVER affect inbox rendering.
  try {
    const sb = getSupabaseAdmin();
    if (!sb) return pixelResponse();

    const ua = req.headers.get("user-agent") || "";
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0]?.trim() || "";
    const isApplePrefetch =
      ua.includes("MailPrivacyProtection") ||
      (ua.includes("Mac OS X") && ua.includes("Apple-Mail"));

    const { data: prospect } = await sb
      .from("outreach_prospects")
      .select("id, campaign, opened_at, open_count, clicked_at, click_count, booked_at")
      .eq("id", prospectId)
      .maybeSingle();

    if (!prospect) return pixelResponse();

    await sb.from("outreach_email_events").insert({
      prospect_id: prospect.id,
      campaign: prospect.campaign ?? "pesttrace",
      event_type: "open",
      user_agent: ua.slice(0, 500),
      ip: ip.slice(0, 64),
    });

    if (!isApplePrefetch) {
      const now = new Date();
      const updated = {
        ...prospect,
        opened_at: prospect.opened_at ?? now.toISOString(),
        open_count: (prospect.open_count ?? 0) + 1,
      };
      const tierFields = engagementUpdateFields(updated, now);
      await sb
        .from("outreach_prospects")
        .update({
          opened_at: updated.opened_at,
          open_count: updated.open_count,
          ...tierFields,
          updated_at: now.toISOString(),
        })
        .eq("id", prospect.id);
    }
  } catch {
    // swallow — tracking must never break the pixel response
  }

  return pixelResponse();
}

// Avoid this route being cached at the CDN — opens must always reach Supabase.
export const dynamic = "force-dynamic";
export const revalidate = 0;
