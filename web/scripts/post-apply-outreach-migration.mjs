#!/usr/bin/env node
/** POST apply-outreach-migration to local or production dashboard. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const envPath = path.join(root, ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
}

const base =
  process.argv[2]?.trim() ||
  process.env.OUTREACH_PUBLIC_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:3000";
const useServiceRole = process.argv.includes("--service-role");
const token = useServiceRole
  ? process.env.SUPABASE_SERVICE_ROLE_KEY
  : process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!token) {
  console.error("Need CRON_SECRET or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const res = await fetch(`${base}/api/setup/apply-outreach-migration`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}` },
});
const body = await res.json().catch(() => ({}));
console.log(res.status, JSON.stringify(body, null, 2));
