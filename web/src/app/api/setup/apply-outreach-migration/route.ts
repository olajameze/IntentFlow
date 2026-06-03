import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

/**
 * POST /api/setup/apply-outreach-migration
 * One-time DDL when SUPABASE_DB_URL (or DATABASE_URL) is set in env.
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

  const migrationPath = path.join(
    process.cwd(),
    "..",
    "supabase",
    "migrations",
    "20260604000000_business_outreach.sql",
  );
  if (!fs.existsSync(migrationPath)) {
    return NextResponse.json({ error: "Migration file not found" }, { status: 500 });
  }

  const sql = fs.readFileSync(migrationPath, "utf8");

  try {
    const { default: pg } = await import("pg");
    const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    await client.connect();
    try {
      await client.query(sql);
    } finally {
      await client.end();
    }
    return NextResponse.json({ ok: true, message: "Migration applied" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Migration failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
