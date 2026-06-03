import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { recordOutreachConversion } from "@/lib/outreach/conversion";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const bodySchema = z.object({
  prospect_id: z.string().uuid(),
  event: z.enum([
    "booking_started",
    "payment_completed",
    "trial_started",
    "deposit_paid",
  ]),
  external_id: z.string().max(256).optional(),
  amount: z.number().optional(),
  currency: z.string().max(8).optional(),
  deposit_paid: z.boolean().optional(),
});

function verifyBearer(authHeader: string | null, secret: string): boolean {
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.slice(7).trim();
  if (!token || !secret) return false;
  try {
    const a = Buffer.from(token);
    const b = Buffer.from(secret);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function verifyHmac(
  rawBody: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature?.startsWith("sha256=") || !secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const provided = signature.slice(7);
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(provided);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** POST — brand sites report booking/payment for outreach attribution. */
export async function POST(req: Request) {
  const rawBody = await req.text();
  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(JSON.parse(rawBody || "{}"));
  } catch (e) {
    const msg = e instanceof z.ZodError ? e.issues[0]?.message : "Invalid body";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const { data: prospect, error } = await sb
    .from("outreach_prospects")
    .select("id, campaign, business_id, name, email, booked_at, opened_at, clicked_at, open_count, click_count")
    .eq("id", parsed.prospect_id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!prospect) return NextResponse.json({ error: "Prospect not found" }, { status: 404 });

  let secret: string | null = null;
  if (prospect.business_id) {
    const { data: settings } = await sb
      .from("business_outreach_settings")
      .select("conversion_webhook_secret")
      .eq("business_id", prospect.business_id)
      .maybeSingle();
    secret = settings?.conversion_webhook_secret ?? null;
  }

  const globalSecret = process.env.OUTREACH_CONVERSION_SECRET?.trim();
  const authHeader = req.headers.get("authorization");
  const sigHeader = req.headers.get("x-intentflow-signature");

  const authed =
    (secret && (verifyBearer(authHeader, secret) || verifyHmac(rawBody, sigHeader, secret))) ||
    (globalSecret &&
      (verifyBearer(authHeader, globalSecret) || verifyHmac(rawBody, sigHeader, globalSecret)));

  if (!authed && (secret || globalSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await recordOutreachConversion(sb, prospect, parsed);
  return NextResponse.json({
    ok: true,
    prospect_id: prospect.id,
    booked: result.booked,
    duplicate: result.duplicate,
  });
}

export const dynamic = "force-dynamic";
