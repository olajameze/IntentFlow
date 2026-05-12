import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { encryptSecret } from "@/lib/crypto";
import { z } from "zod";

function toSafeBusiness(b: Record<string, unknown>) {
  const {
    stripe_secret_ciphertext,
    stripe_secret_iv: _iv,
    stripe_secret_tag: _tag,
    ...rest
  } = b;
  void _iv;
  void _tag;
  return {
    ...rest,
    has_stripe: Boolean(stripe_secret_ciphertext),
  };
}

const businessSchema = z.object({
  name: z.string().min(2),
  type: z.enum(["local_service", "b2b_saas", "agency", "ecommerce", "generic"]),
  target_audience: z.string().optional(),
  industry: z.string().optional(),
  social_accounts: z.record(z.string(), z.string()).optional(),
  website_url: z.string().url().optional().or(z.literal("")),
  goals: z.string().optional(),
  umami_website_id: z.string().optional(),
  active: z.boolean().optional(),
  stripe_secret_key: z.string().optional(),
});

export async function GET() {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from("businesses").select("*").order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const safe = data?.map((row) => toSafeBusiness(row as Record<string, unknown>)) ?? [];
  return NextResponse.json(safe);
}

export async function POST(req: Request) {
  const json = await req.json();
  const parsed = businessSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;
  const master = process.env.STRIPE_SECRET_ENCRYPTION_KEY;
  let stripeFields: Record<string, string | null> = {};
  if (body.stripe_secret_key && master) {
    const enc = encryptSecret(body.stripe_secret_key, master);
    stripeFields = {
      stripe_secret_ciphertext: enc.ciphertext,
      stripe_secret_iv: enc.iv,
      stripe_secret_tag: enc.tag,
    };
  }
  const insert = {
    name: body.name,
    type: body.type,
    target_audience: body.target_audience ?? null,
    industry: body.industry ?? null,
    social_accounts: body.social_accounts ?? {},
    website_url: body.website_url || null,
    goals: body.goals ?? null,
    umami_website_id: body.umami_website_id ?? null,
    active: body.active ?? true,
    ...stripeFields,
  };
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from("businesses").insert(insert).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(toSafeBusiness(data as Record<string, unknown>));
}

export async function PATCH(req: Request) {
  const json = await req.json();
  const id = json.id as string | undefined;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const parsed = businessSchema.partial().safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;
  const master = process.env.STRIPE_SECRET_ENCRYPTION_KEY;
  const update: Record<string, unknown> = {};
  (Object.entries(body) as [string, unknown][]).forEach(([key, value]) => {
    if (value === undefined || key === "id" || key === "stripe_secret_key") return;
    update[key] = value;
  });
  if (body.stripe_secret_key) {
    if (!master) {
      return NextResponse.json({ error: "STRIPE_SECRET_ENCRYPTION_KEY not set" }, { status: 400 });
    }
    const enc = encryptSecret(body.stripe_secret_key, master);
    update.stripe_secret_ciphertext = enc.ciphertext;
    update.stripe_secret_iv = enc.iv;
    update.stripe_secret_tag = enc.tag;
    delete update.stripe_secret_key;
  }
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from("businesses").update(update).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(toSafeBusiness(data as Record<string, unknown>));
}
