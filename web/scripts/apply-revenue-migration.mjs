#!/usr/bin/env node
/**
 * Apply revenue_entries Stripe idempotency index migration.
 * Uses SUPABASE_DB_URL when set; otherwise copies SQL and opens Supabase SQL Editor.
 *
 * Usage (from web/): node scripts/apply-revenue-migration.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const sqlPath = path.join(root, "..", "supabase", "migrations", "20260616000000_revenue_entries_stripe_idempotency.sql");

function loadEnv() {
  const envPath = path.join(root, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
}

function openSqlEditor(sql) {
  const ref = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").match(/https:\/\/([^.]+)/)?.[1];
  const url = ref
    ? `https://supabase.com/dashboard/project/${ref}/sql/new`
    : "https://supabase.com/dashboard";

  try {
    if (process.platform === "win32") {
      execSync(`powershell -Command "Set-Clipboard -Value @'\n${sql.replace(/'/g, "''")}\n'@"`, {
        stdio: "ignore",
      });
      console.log("Migration SQL copied to clipboard.");
    }
  } catch {
    console.log("SQL file:", sqlPath);
  }

  console.log("Open SQL Editor:", url);
  try {
    execSync(`start "" "${url}"`, { stdio: "ignore", shell: true });
  } catch {
    /* ignore */
  }
  console.log("Paste and click Run, then: npm run vault:stripe-keys && npm run engine:revenue");
}

async function applyWithPg(dbUrl, sql) {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

async function main() {
  loadEnv();
  const sql = fs.readFileSync(sqlPath, "utf8");
  const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

  if (dbUrl && !dbUrl.includes("YOUR_DB_PASSWORD")) {
    try {
      await applyWithPg(dbUrl, sql);
      console.log("Revenue migration applied via Postgres.");
      return;
    } catch (e) {
      console.warn("Postgres apply failed:", e instanceof Error ? e.message : e);
      console.log("Falling back to SQL Editor…");
    }
  } else if (dbUrl?.includes("YOUR_DB_PASSWORD")) {
    console.log("SUPABASE_DB_URL still has placeholder password — using SQL Editor.");
  } else {
    console.log("SUPABASE_DB_URL not set — using SQL Editor.");
  }

  openSqlEditor(sql);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
