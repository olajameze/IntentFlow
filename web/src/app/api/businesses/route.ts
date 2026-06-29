import { NextResponse } from "next/server";
import { encryptSecret } from "@/lib/crypto";
import { clarityProjectIdInvalidMessage, normalizeClarityProjectId } from "@/lib/clarity";
import { withSupabaseRoute } from "@/lib/with-supabase-route";
import { supabaseErrorResponse } from "@/lib/supabase-error-response";
import { z } from "zod";

/** Returns null when empty/omitted; throws if user-entered value is not a valid http(s) URL. */
function normalizeWebsiteUrl(raw: string | undefined | null): string | null {
  if (raw === undefined || raw === null) return null;
  const t = String(raw).trim();
  if (!t) return null;
  const candidate = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(candidate);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      throw new SyntaxError("not http(s)");
    }
    return u.href;
  } catch {
    throw new Error("INVALID_WEBSITE_URL");
  }
}

function websiteUrlInvalidResponse() {
  return NextResponse.json(
    {
      error: {
        formErrors: [] as string[],
        fieldErrors: {
          website_url: [
            "Invalid URL — use a full link like https://example.com (or leave Website empty)",
          ],
        },
      },
    },
    { status: 400 },
  );
}

function toSafeBusiness(b: Record<string, unknown>) {
  const {
    stripe_secret_ciphertext,
    stripe_secret_iv: _siv,
    stripe_secret_tag: _stag,
    clarity_api_token_ciphertext,
    clarity_api_token_iv: _civ,
    clarity_api_token_tag: _ctag,
    ...rest
  } = b;
  void _siv;
  void _stag;
  void _civ;
  void _ctag;
  return {
    ...rest,
    has_stripe: Boolean(stripe_secret_ciphertext),
    has_clarity_token: Boolean(clarity_api_token_ciphertext),
  };
}

const businessSchema = z.object({
  name: z.string().min(2),
  type: z.enum(["local_service", "b2b_saas", "agency", "ecommerce", "generic"]),
  target_audience: z.string().optional(),
  industry: z.string().optional(),
  social_accounts: z.record(z.string(), z.string()).optional(),
  website_url: z.string().optional(),
  goals: z.string().optional(),
  clarity_project_id: z.string().nullable().optional(),
  active: z.boolean().optional(),
  stripe_secret_key: z.string().optional(),
  clarity_api_token: z.string().optional(),
});

export async function GET() {
  return withSupabaseRoute(async (sb) => {
    const { data, error } = await sb.from("businesses").select("*").order("name");
    if (error) return supabaseErrorResponse(error);
    const safe = data?.map((row) => toSafeBusiness(row as Record<string, unknown>)) ?? [];
    return NextResponse.json(safe);
  });
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
  let website_url: string | null;
  try {
    website_url = normalizeWebsiteUrl(body.website_url);
  } catch {
    return websiteUrlInvalidResponse();
  }
  let clarity_project_id: string | null = null;
  if (body.clarity_project_id !== undefined) {
    clarity_project_id = normalizeClarityProjectId(body.clarity_project_id);
    if (body.clarity_project_id && String(body.clarity_project_id).trim() && !clarity_project_id) {
      return NextResponse.json({ error: clarityProjectIdInvalidMessage() }, { status: 400 });
    }
  }
  let clarityFields: Record<string, string | null> = {};
  if (body.clarity_api_token && master) {
    const raw = body.clarity_api_token.trim();
    if (raw) {
      const enc = encryptSecret(raw, master);
      clarityFields = {
        clarity_api_token_ciphertext: enc.ciphertext,
        clarity_api_token_iv: enc.iv,
        clarity_api_token_tag: enc.tag,
      };
    }
  }
  const insert = {
    name: body.name,
    type: body.type,
    target_audience: body.target_audience ?? null,
    industry: body.industry ?? null,
    social_accounts: body.social_accounts ?? {},
    website_url,
    goals: body.goals ?? null,
    clarity_project_id,
    active: body.active ?? true,
    ...stripeFields,
    ...clarityFields,
  };
  return withSupabaseRoute(async (sb) => {
    const { data, error } = await sb.from("businesses").insert(insert).select("*").single();
    if (error) return supabaseErrorResponse(error);
    return NextResponse.json(toSafeBusiness(data as Record<string, unknown>));
  });
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
  if (body.website_url !== undefined) {
    try {
      update.website_url = normalizeWebsiteUrl(body.website_url);
    } catch {
      return websiteUrlInvalidResponse();
    }
  }
  if (body.clarity_project_id !== undefined) {
    const clarityId = normalizeClarityProjectId(body.clarity_project_id);
    if (body.clarity_project_id && String(body.clarity_project_id).trim() && !clarityId) {
      return NextResponse.json({ error: clarityProjectIdInvalidMessage() }, { status: 400 });
    }
    update.clarity_project_id = clarityId;
  }
  (Object.entries(body) as [string, unknown][]).forEach(([key, value]) => {
    if (
      value === undefined ||
      key === "id" ||
      key === "stripe_secret_key" ||
      key === "clarity_api_token" ||
      key === "website_url" ||
      key === "clarity_project_id"
    )
      return;
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
  if (body.clarity_api_token !== undefined) {
    if (!master) {
      return NextResponse.json({ error: "STRIPE_SECRET_ENCRYPTION_KEY not set" }, { status: 400 });
    }
    const raw = String(body.clarity_api_token ?? "").trim();
    if (!raw) {
      update.clarity_api_token_ciphertext = null;
      update.clarity_api_token_iv = null;
      update.clarity_api_token_tag = null;
    } else {
      const enc = encryptSecret(raw, master);
      update.clarity_api_token_ciphertext = enc.ciphertext;
      update.clarity_api_token_iv = enc.iv;
      update.clarity_api_token_tag = enc.tag;
    }
  }
  return withSupabaseRoute(async (sb) => {
    const { data, error } = await sb.from("businesses").update(update).eq("id", id).select("*").single();
    if (error) return supabaseErrorResponse(error);
    return NextResponse.json(toSafeBusiness(data as Record<string, unknown>));
  });
}
