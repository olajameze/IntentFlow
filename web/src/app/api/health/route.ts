import { NextResponse } from "next/server";
import {
  getEmailProvider,
  getSmtpConfig,
  isConfiguredForCampaign,
} from "@/lib/outreach/campaign-env";
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
    brevoWebhookSecretConfigured: Boolean(process.env.BREVO_WEBHOOK_SECRET?.trim()),
    cronSecretConfigured: Boolean(process.env.CRON_SECRET?.trim()),
    outreachEmailProvider: getEmailProvider(),
    outreachPesttraceEmailConfigured: isConfiguredForCampaign("pesttrace").ok,
    outreachPesttraceSmtpConfigured: getSmtpConfig("pesttrace").configured,
    outreachPublicBaseUrlConfigured: Boolean(process.env.OUTREACH_PUBLIC_BASE_URL?.trim()),
  };

  let supabaseQueryable = false;
  let outreachSchemaReady = false;
  let outreachStatsRpcReady = false;
  let queryError: string | undefined;
  const hints: string[] = [];

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

      const { error: rpcErr } = await sb.rpc("outreach_campaign_stats", { p_campaign: "pesttrace" });
      outreachStatsRpcReady = !rpcErr;
      if (rpcErr && !outreachStatsRpcReady) {
        hints.push("Run POST /api/setup/apply-outreach-migration for stats RPC");
      }
    } catch (e) {
      queryError = e instanceof Error ? e.message : String(e);
    }
  }

  if (!outreachSchemaReady) {
    hints.push("Apply outreach migrations (20260607+)");
  }
  if (!checks.brevoWebhookSecretConfigured) {
    hints.push("Set BREVO_WEBHOOK_SECRET and register /api/outreach-webhooks/brevo in Brevo");
  }
  if (!checks.outreachPesttraceEmailConfigured) {
    hints.push("Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD, OUTREACH_FROM_EMAIL on Vercel Production");
  }
  if (!checks.outreachPublicBaseUrlConfigured) {
    hints.push("Set OUTREACH_PUBLIC_BASE_URL=https://intent-flow-xi.vercel.app for tracking links");
  }

  const ready = url && srk && supabaseQueryable && outreachSchemaReady && outreachStatsRpcReady;

  const body = {
    ok: ready,
    status: ready ? ("ready" as const) : ("degraded" as const),
    checks: {
      ...checks,
      supabaseQueryable,
      outreachSchemaReady,
      outreachStatsRpcReady,
    },
    ...(queryError ? { hint: queryError } : {}),
    ...(hints.length ? { hints } : {}),
  };

  return NextResponse.json(body, { status: ready ? 200 : 503 });
}
