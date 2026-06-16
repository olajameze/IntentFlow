import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

function readRevenueMigrationSql(): string {
  const sqlPath = path.join(
    process.cwd(),
    "..",
    "supabase",
    "migrations",
    "20260616000000_revenue_entries_stripe_idempotency.sql",
  );
  return fs.readFileSync(sqlPath, "utf8");
}

/**
 * POST /api/setup/apply-revenue-migration
 * Applies revenue_entries Stripe idempotency index when SUPABASE_DB_URL is set.
 * Auth: Bearer CRON_SECRET or SUPABASE_SERVICE_ROLE_KEY; dev allows unauthenticated POST.
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
  if (!dbUrl || dbUrl.includes("YOUR_DB_PASSWORD")) {
    return NextResponse.json(
      {
        error: "SUPABASE_DB_URL not configured",
        hint: "Set Database URI in web/.env.local (replace YOUR_DB_PASSWORD), or run npm run setup:revenue-migration",
        sqlFile: "supabase/migrations/20260616000000_revenue_entries_stripe_idempotency.sql",
      },
      { status: 503 },
    );
  }

  let sql: string;
  try {
    sql = readRevenueMigrationSql();
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
      message: "Revenue migration applied",
      migration: "20260616000000_revenue_entries_stripe_idempotency",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Migration failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
