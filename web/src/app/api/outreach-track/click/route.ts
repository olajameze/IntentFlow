import { NextResponse } from "next/server";
import { engagementUpdateFields } from "@/lib/outreach/engagement";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

/**
 * GET /api/outreach-track/click?p=<prospect_id>&to=<encoded_url>
 *
 * Click redirector for outreach CTA buttons. The send route rewrites every
 * ``data-outreach-cta="true"`` anchor href to point here so we can:
 *   1. record a click event in ``outreach_email_events`` (Klaviyo step 9 — click rate),
 *   2. set ``clicked_at`` + bump ``click_count`` on the prospect,
 *   3. then 302 to the original destination (the brand's booking / landing page,
 *      already UTM-tagged so Umami picks up the visit).
 *
 * If anything fails — invalid id, DB down, missing ``to`` — we degrade gracefully:
 *   • Missing/invalid ``to``: 302 to the campaign's brand homepage.
 *   • DB error: silently log click failure and still 302 to ``to``.
 * The prospect must always reach the destination, even if tracking is broken.
 */

const FALLBACK_DESTINATIONS: Record<string, string> = {
  pesttrace: "https://pesttrace.com/",
  weathers: "https://weatherspestsolutions.co.uk/",
};

function safeRedirect(url: string): NextResponse {
  // 302 Found so caches / link previews don't poison the redirect long-term
  return NextResponse.redirect(url, 302);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const prospectId = (searchParams.get("p") || "").trim();
  const to = (searchParams.get("to") || "").trim();

  // Validate destination — must be absolute http(s)
  let destination = to;
  try {
    const parsed = new URL(to);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      destination = FALLBACK_DESTINATIONS.pesttrace;
    }
  } catch {
    destination = FALLBACK_DESTINATIONS.pesttrace;
  }

  // No prospect id → still redirect, just don't track
  if (!prospectId || !/^[0-9a-f-]{36}$/i.test(prospectId)) {
    return safeRedirect(destination);
  }

  try {
    const sb = getSupabaseAdmin();
    const ua = req.headers.get("user-agent") || "";
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0]?.trim() || "";

    const { data: prospect } = await sb
      .from("outreach_prospects")
      .select("id, campaign, clicked_at, click_count, opened_at, open_count, booked_at")
      .eq("id", prospectId)
      .maybeSingle();

    if (prospect) {
      await sb.from("outreach_email_events").insert({
        prospect_id: prospect.id,
        campaign: prospect.campaign ?? "pesttrace",
        event_type: "click",
        url: destination.slice(0, 1000),
        user_agent: ua.slice(0, 500),
        ip: ip.slice(0, 64),
      });

      const now = new Date();
      const updated = {
        ...prospect,
        clicked_at: prospect.clicked_at ?? now.toISOString(),
        click_count: (prospect.click_count ?? 0) + 1,
      };
      const tierFields = engagementUpdateFields(updated, now);
      await sb
        .from("outreach_prospects")
        .update({
          clicked_at: updated.clicked_at,
          click_count: updated.click_count,
          ...tierFields,
          updated_at: now.toISOString(),
        })
        .eq("id", prospect.id);
    }
  } catch {
    // swallow — never block the redirect
  }

  return safeRedirect(destination);
}

export const dynamic = "force-dynamic";
export const revalidate = 0;
