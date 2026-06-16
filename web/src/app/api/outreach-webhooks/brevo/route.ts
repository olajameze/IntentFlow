import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { invalidateOutreachStats } from "@/lib/outreach/campaign-stats";
import { handleInboundReply } from "@/lib/outreach/reply-handler";
import { outreachLog } from "@/lib/outreach/logger";
import { addToSuppressionList } from "@/lib/outreach/suppression";
import { withSupabaseRoute } from "@/lib/with-supabase-route";

type BrevoEvent = {
  event?: string;
  email?: string;
  "message-id"?: string;
  subject?: string;
  reason?: string;
  tags?: string[];
  "X-IntentFlow-Prospect-Id"?: string;
  custom?: { prospect_id?: string; campaign?: string };
};

function verifyBrevoSecret(rawBody: string, token: string | null, secret: string): boolean {
  if (!token || !secret) return !secret;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return token === secret;
  }
}

function prospectIdFromEvent(event: BrevoEvent): string | null {
  if (event["X-IntentFlow-Prospect-Id"]) return event["X-IntentFlow-Prospect-Id"].trim();
  if (event.custom?.prospect_id) return event.custom.prospect_id.trim();
  if (Array.isArray(event.tags)) {
    const tag = event.tags.find((t) => t.startsWith("prospect_id:"));
    if (tag) return tag.split(":")[1]?.trim() ?? null;
  }
  return null;
}

/** POST — Brevo transactional / inbound webhooks. */
export async function POST(req: Request) {
  const secret = process.env.BREVO_WEBHOOK_SECRET?.trim();
  const rawBody = await req.text();
  const token =
    req.headers.get("x-brevo-signature") ||
    req.headers.get("authorization")?.replace("Bearer ", "") ||
    null;

  if (secret && !verifyBrevoSecret(rawBody, token, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: BrevoEvent | BrevoEvent[];
  try {
    payload = JSON.parse(rawBody) as BrevoEvent | BrevoEvent[];
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const events = Array.isArray(payload) ? payload : [payload];

  return withSupabaseRoute(async (sb) => {
    for (const event of events) {
      const eventType = (event.event || "").toLowerCase();
      let prospectId = prospectIdFromEvent(event);
      const hadHeaderId = Boolean(prospectId);
      const email = event.email?.trim().toLowerCase();

      if (!prospectId && email) {
        const { data: match } = await sb
          .from("outreach_prospects")
          .select("id, campaign")
          .eq("email", email)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (match) {
          prospectId = match.id;
          if (!hadHeaderId) {
            outreachLog({
              level: "warn",
              event: "brevo_email_only_match",
              campaign: match.campaign ?? "pesttrace",
              prospectId: match.id,
              issues: [email],
            });
          }
        }
      }

      if (!prospectId) continue;

      const { data: prospect } = await sb
        .from("outreach_prospects")
        .select("id, campaign")
        .eq("id", prospectId)
        .maybeSingle();
      if (!prospect) continue;

      const campaign = String(prospect.campaign || "pesttrace");
      const now = new Date().toISOString();

      if (eventType === "delivered") {
        await sb
          .from("outreach_prospects")
          .update({ delivered_at: now, updated_at: now })
          .eq("id", prospectId);
        await sb.from("outreach_email_events").insert({
          prospect_id: prospectId,
          campaign,
          event_type: "delivered",
        });
      } else if (eventType === "hard_bounce" || eventType === "soft_bounce" || eventType === "blocked") {
        if (email) await addToSuppressionList(sb, email, "bounce", campaign);
        await sb
          .from("outreach_prospects")
          .update({ status: "bounced", updated_at: now })
          .eq("id", prospectId);
        await sb.from("outreach_email_events").insert({
          prospect_id: prospectId,
          campaign,
          event_type: "bounce",
        });
      } else if (eventType === "spam" || eventType === "invalid") {
        if (email) await addToSuppressionList(sb, email, "complaint", campaign);
        await sb
          .from("outreach_prospects")
          .update({ status: "unsubscribed", updated_at: now })
          .eq("id", prospectId);
        await sb.from("outreach_email_events").insert({
          prospect_id: prospectId,
          campaign,
          event_type: "unsubscribe",
        });
      } else if (eventType === "inbound_email" || eventType === "reply") {
        const bodyText =
          (event as { html?: string; text?: string }).text ||
          (event as { html?: string }).html?.replace(/<[^>]+>/g, " ") ||
          event.reason ||
          event.subject ||
          "";
        await handleInboundReply(sb, {
          prospectId,
          campaign,
          fromEmail: email || "",
          bodyText,
          subject: event.subject,
          messageId: event["message-id"],
        });
      }

      if (
        ["delivered", "hard_bounce", "soft_bounce", "blocked", "spam", "invalid", "inbound_email", "reply"].includes(
          eventType,
        )
      ) {
        invalidateOutreachStats(campaign);
      }
    }

    return NextResponse.json({ ok: true, processed: events.length });
  });
}

export const dynamic = "force-dynamic";
