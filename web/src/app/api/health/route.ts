import { NextResponse } from "next/server";
import { resolveNextPublicSupabaseKey } from "@/lib/resolve-next-public-supabase-key";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

/**
 * Lightweight readiness probe for dashboards and CI.
 * - 200 when service role DB can run a trivial query
 * - 503 otherwise (still returns JSON for debugging — never echoes secrets)
 */
export async function GET() {
  const url = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim());
  const srk = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
  const publishable = Boolean(resolveNextPublicSupabaseKey());

  const checks = {
    nextPublicSupabaseUrl: url,
    supabaseServiceRoleConfigured: srk,
    supabasePublishableConfigured: publishable,
    stripeEncryptionConfigured: Boolean(process.env.STRIPE_SECRET_ENCRYPTION_KEY?.trim()),
  };

  let supabaseQueryable = false;
  let outreachSchemaReady = false;
  let queryError: string | undefined;

  if (url && srk) {
    try {
      const sb = getSupabaseAdmin();
      const { error } = await sb.from("businesses").select("id").limit(1);
      supabaseQueryable = !error;
      if (error) queryError = error.message;

      const { error: outreachErr } = await sb
        .from("outreach_prospects")
        .select("lead_score, delivered_at, sequence_step")
        .limit(1);
      outreachSchemaReady = !outreachErr;
      if (outreachErr && !queryError) queryError = outreachErr.message;
    } catch (e) {
      queryError = e instanceof Error ? e.message : String(e);
    }
  }

  const ready = url && srk && supabaseQueryable && outreachSchemaReady;

  const body = {
    ok: ready,
    status: ready ? ("ready" as const) : ("degraded" as const),
    checks: {
      ...checks,
      supabaseQueryable,
      outreachSchemaReady,
    },
    ...(queryError ? { hint: queryError } : {}),
  };

  return NextResponse.json(body, { status: ready ? 200 : 503 });
}
