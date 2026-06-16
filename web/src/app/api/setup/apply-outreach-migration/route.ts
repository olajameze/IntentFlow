import { NextResponse } from "next/server";
import { readOutreachMigrationsSql } from "@/lib/outreach/apply-migrations";

/**
 * POST /api/setup/apply-outreach-migration
 * Applies all outreach-related DDL when SUPABASE_DB_URL (or DATABASE_URL) is set.
 * Auth: Authorization: Bearer <CRON_SECRET> or <SUPABASE_SERVICE_ROLE_KEY>
 */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const cron = process.env.CRON_SECRET?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const allowed =
    (cron && token === cron) ||
    (serviceKey && token === serviceKey) ||
    (process.env.NODE_ENV === "development" && !cron && !token);

  if (!allowed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbUrl = process.env.SUPABASE_DB_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!dbUrl) {
    return NextResponse.json(
      {
        error: "SUPABASE_DB_URL not configured",
        hint: "Add Database URI from Supabase Dashboard → Settings → Database to web/.env.local and Vercel env.",
      },
      { status: 503 },
    );
  }

  let sql: string;
  try {
    sql = readOutreachMigrationsSql();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Migration file not found";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  try {
    const { default: pg } = await import("pg");
    const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    await client.connect();
    try {
      await client.query(sql);
    } finally {
      await client.end();
    }
    return NextResponse.json({
      ok: true,
      message: "Outreach migrations applied",
      migrations: [
        "20260604000000_business_outreach",
        "20260607000000_outreach_intelligence",
        "20260608000000_outreach_event_types",
        "20260608100000_outreach_webhook_subscriptions",
        "20260609000000_outreach_campaign_stats_rpc",
        "20260610000000_outreach_snapshots",
        "20260611000000_outreach_jgdevs_campaign",
        "20260617000000_outreach_platform_v2",
      ],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Migration failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
