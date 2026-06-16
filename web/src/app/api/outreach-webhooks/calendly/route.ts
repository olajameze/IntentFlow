import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { recordOutreachConversion } from "@/lib/outreach/conversion";
import { withSupabaseRoute } from "@/lib/with-supabase-route";

function verifyCalendlySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return !secret;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return signature === secret;
  }
}

/** POST — Calendly invitee.created webhook */
export async function POST(req: Request) {
  const secret = process.env.CALENDLY_WEBHOOK_SECRET?.trim();
  const rawBody = await req.text();
  const sig = req.headers.get("calendly-webhook-signature");

  if (secret && !verifyCalendlySignature(rawBody, sig, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: {
    event?: string;
    payload?: {
      email?: string;
      uri?: string;
      tracking?: { utm_campaign?: string; salesforce_uuid?: string };
      questions_and_answers?: { question: string; answer: string }[];
    };
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = payload.payload?.email?.trim().toLowerCase();
  if (!email) return NextResponse.json({ ok: true, skipped: true });

  return withSupabaseRoute(async (sb) => {
    let prospectId: string | null = null;
    const pAnswer = payload.payload?.questions_and_answers?.find((q) =>
      /prospect|intentflow|p=/i.test(q.answer || q.question),
    );
    const pMatch = pAnswer?.answer?.match(/[0-9a-f-]{36}/i);
    if (pMatch) prospectId = pMatch[0];

    if (!prospectId) {
      const { data: match } = await sb
        .from("outreach_prospects")
        .select("id, campaign, business_id, name, email, booked_at, opened_at, clicked_at, open_count, click_count")
        .eq("email", email)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!match) return NextResponse.json({ ok: true, matched: false });
      const result = await recordOutreachConversion(sb, match, {
        event: "booking_started",
        external_id: payload.payload?.uri || `calendly:${email}:${Date.now()}`,
        deposit_paid: false,
      });
      return NextResponse.json({ ok: true, ...result });
    }

    const { data: prospect } = await sb
      .from("outreach_prospects")
      .select("id, campaign, business_id, name, email, booked_at, opened_at, clicked_at, open_count, click_count")
      .eq("id", prospectId)
      .maybeSingle();
    if (!prospect) return NextResponse.json({ ok: true, matched: false });

    const result = await recordOutreachConversion(sb, prospect, {
      event: "booking_started",
      external_id: payload.payload?.uri || `calendly:${prospectId}`,
      deposit_paid: false,
    });
    return NextResponse.json({ ok: true, ...result });
  });
}

export const dynamic = "force-dynamic";
