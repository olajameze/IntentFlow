#!/usr/bin/env node
/**
 * One-shot setup: apply outreach migration (if DATABASE_URL set), enable outreach
 * for all active businesses, bootstrap LLM copy, print webhook secrets.
 *
 * Usage (from web/):
 *   node scripts/setup-marketing-conversion.mjs
 *
 * For migration without Supabase CLI login, add to .env.local:
 *   SUPABASE_DB_URL=postgresql://postgres.[ref]:[PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres
 * (Supabase Dashboard → Project Settings → Database → Connection string → URI)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadEnv() {
  const envPath = path.join(root, ".env.local");
  if (!fs.existsSync(envPath)) {
    console.error("Missing web/.env.local");
    process.exit(1);
  }
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
}

async function applyMigrationWithPg() {
  const url = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!url) return false;

  let pg;
  try {
    pg = (await import("pg")).default;
  } catch {
    console.log("Install pg: npm install pg --save-dev");
    return false;
  }

  const migrationFiles = [
    "20260604000000_business_outreach.sql",
    "20260607000000_outreach_intelligence.sql",
    "20260608000000_outreach_event_types.sql",
    "20260608100000_outreach_webhook_subscriptions.sql",
  ];
  const sql = migrationFiles
    .map((f) => fs.readFileSync(path.join(root, "..", "supabase", "migrations", f), "utf8"))
    .join("\n\n");
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
    console.log("Migration applied via Postgres.");
    return true;
  } finally {
    await client.end();
  }
}

async function tableExists(sb) {
  const { error } = await sb.from("business_outreach_settings").select("business_id").limit(1);
  return !error;
}

async function main() {
  loadEnv();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  const sb = createClient(url, key);

  if (!(await tableExists(sb))) {
    console.log("business_outreach_settings not found — applying migration…");
    const applied = await applyMigrationWithPg();
    if (!applied) {
      console.error(`
Could not apply migration automatically.

Option A — add SUPABASE_DB_URL to web/.env.local (Database → Connection string → URI), then re-run:
  node scripts/setup-marketing-conversion.mjs

Option B — Supabase SQL Editor:
  https://supabase.com/dashboard/project/tajdfxphgeddfcswsham/sql/new
  Paste all files in supabase/migrations/20260604*.sql through 202606081*.sql
`);
      process.exit(1);
    }
  } else {
    console.log("Migration tables already present.");
  }

  if (!process.env.CRON_SECRET?.trim()) {
    const secret = crypto.randomBytes(24).toString("hex");
    fs.appendFileSync(path.join(root, ".env.local"), `\nCRON_SECRET=${secret}\n`);
    console.log("Added CRON_SECRET to .env.local — also add it as GitHub repo secret CRON_SECRET.");
  }

  const { data: businesses } = await sb.from("businesses").select("*").eq("active", true);
  const secretsOut = {};

  for (const biz of businesses ?? []) {
    let { data: settings } = await sb
      .from("business_outreach_settings")
      .select("*")
      .eq("business_id", biz.id)
      .maybeSingle();

    if (!settings) {
      const slug =
        biz.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 24) +
        "-" +
        biz.id.replace(/-/g, "").slice(0, 8);
      const website = (biz.website_url || "").replace(/\/$/, "");
      const { data: created, error } = await sb
        .from("business_outreach_settings")
        .insert({
          business_id: biz.id,
          enabled: true,
          campaign_slug: ["weathers", "pesttrace"].includes(slug) ? slug : slug,
          sender_from_name: biz.name,
          cta_url_template: website
            ? `${website}/?utm_source=outreach&utm_medium=email&utm_campaign=${slug}&p={prospect_id}`
            : `https://example.com/?p={prospect_id}`,
          cta_label: biz.type === "b2b_saas" ? "Start free trial" : "Book now",
          accent_color: "#2563EB",
          trust_badges: [],
          conversion_webhook_secret: crypto.randomBytes(24).toString("hex"),
        })
        .select("*")
        .single();
      if (error) {
        console.error(`Failed settings for ${biz.name}:`, error.message);
        continue;
      }
      settings = created;
    } else if (!settings.enabled) {
      await sb
        .from("business_outreach_settings")
        .update({ enabled: true, updated_at: new Date().toISOString() })
        .eq("business_id", biz.id);
      settings.enabled = true;
    }

    secretsOut[biz.name] = {
      campaign_slug: settings.campaign_slug,
      webhook_secret: settings.conversion_webhook_secret,
    };
    console.log(`Enabled outreach: ${biz.name} (${settings.campaign_slug})`);
  }

  const integrationsDir = path.join(root, "..", "integrations");
  fs.mkdirSync(integrationsDir, { recursive: true });
  const base = process.env.OUTREACH_PUBLIC_BASE_URL?.replace(/\/$/, "") || "https://intent-flow-xi.vercel.app";
  const payload = {
    intentflow_webhook_url: `${base}/api/outreach-conversion`,
    businesses: secretsOut,
    generated_at: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(integrationsDir, "webhook-secrets.local.json"),
    JSON.stringify(payload, null, 2),
  );
  console.log(`Wrote integrations/webhook-secrets.local.json (gitignored via integrations/.gitignore)`);

  fs.writeFileSync(
    path.join(integrationsDir, ".gitignore"),
    "webhook-secrets.local.json\n",
  );

  console.log("\nNext: paste integrations/intentflow-conversion-snippet.js into Weathers /book and PestTrace checkout.");
  console.log("Add GitHub secret CRON_SECRET matching .env.local if not already set.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
