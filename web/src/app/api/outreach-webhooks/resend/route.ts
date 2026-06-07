import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { withSupabaseRoute } from "@/lib/with-supabase-route";

type ResendWebhookEvent = {
  type: string;
  data?: {
    tags?: Array<{ name: string; value: string }>;
    to?: string[];
  };
};

function verifyResendSignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return signature === expected;
  }
}

function prospectIdFromTags(tags?: Array<{ name: string; value: string }>): string | null {
  const tag = tags?.find((t) => t.name === "prospect_id");
  return tag?.value?.trim() || null;
}

/** POST — Resend delivery/bounce/complaint webhooks. */
export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  const rawBody = await req.text();
  const signature = req.headers.get("resend-signature") || req.headers.get("x-resend-signature");

  if (secret && !verifyResendSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: ResendWebhookEvent;
  try {
    event = JSON.parse(rawBody) as ResendWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const prospectId = prospectIdFromTags(event.data?.tags);
  if (!prospectId) {
    return NextResponse.json({ ok: true, skipped: "no prospect_id tag" });
  }

  return withSupabaseRoute(async (sb) => {
    const now = new Date().toISOString();
    const { data: prospect } = await sb
      .from("outreach_prospects")
      .select("id, campaign, status")
      .eq("id", prospectId)
      .maybeSingle();

    if (!prospect) {
      return NextResponse.json({ ok: true, skipped: "prospect not found" });
    }

    const campaign = String(prospect.campaign || "pesttrace");

    if (event.type === "email.delivered") {
      await sb
        .from("outreach_prospects")
        .update({ delivered_at: now, updated_at: now })
        .eq("id", prospectId);
      await sb.from("outreach_email_events").insert({
        prospect_id: prospectId,
        campaign,
        event_type: "delivered",
      });
    } else if (event.type === "email.bounced") {
      await sb
        .from("outreach_prospects")
        .update({ status: "bounced", updated_at: now })
        .eq("id", prospectId);
      await sb.from("outreach_email_events").insert({
        prospect_id: prospectId,
        campaign,
        event_type: "bounce",
      });
    } else if (event.type === "email.complained") {
      await sb
        .from("outreach_prospects")
        .update({ status: "unsubscribed", updated_at: now })
        .eq("id", prospectId);
      await sb.from("outreach_email_events").insert({
        prospect_id: prospectId,
        campaign,
        event_type: "unsubscribe",
      });
    }

    return NextResponse.json({ ok: true, type: event.type });
  });
}

export const dynamic = "force-dynamic";
