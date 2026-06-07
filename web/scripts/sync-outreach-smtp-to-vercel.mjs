#!/usr/bin/env node
/**
 * Push outreach SMTP env vars from web/.env.local to Vercel Production.
 * Run from web/: node scripts/sync-outreach-smtp-to-vercel.mjs
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

const ROOT = path.resolve(import.meta.dirname, "..");
const ENV_FILE = path.join(ROOT, ".env.local");
const KEYS = [
  "OUTREACH_EMAIL_PROVIDER",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "OUTREACH_FROM_EMAIL",
  "OUTREACH_FROM_NAME",
  "OUTREACH_REPLY_TO",
  "OUTREACH_PUBLIC_BASE_URL",
];

if (!fs.existsSync(ENV_FILE)) {
  console.error("Missing", ENV_FILE);
  process.exit(1);
}

const env = dotenv.parse(fs.readFileSync(ENV_FILE, "utf8"));
const missing = KEYS.filter((k) => !env[k]?.trim());
if (missing.length) {
  console.warn("Skipping unset keys:", missing.join(", "));
}

for (const key of KEYS) {
  const value = env[key]?.trim();
  if (!value) continue;
  const sensitive = key.includes("PASSWORD") || key.includes("SECRET") || key.includes("KEY");
  const args = [
    "vercel",
    "env",
    "add",
    key,
    "production",
    "--value",
    value,
    "--force",
    "--yes",
    ...(sensitive ? ["--sensitive"] : []),
  ];
  console.log(`Updating ${key} on Vercel Production…`);
  execFileSync("npx", args, { cwd: ROOT, stdio: "inherit", shell: true });
}

console.log("Done. Redeploy production for changes to take effect.");
