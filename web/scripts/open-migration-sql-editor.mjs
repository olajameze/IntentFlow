#!/usr/bin/env node
/** Opens Supabase SQL editor and copies migration SQL to clipboard (Windows). */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.join(__dirname, "..", "..", "supabase", "migrations", "20260604000000_business_outreach.sql");
const sql = fs.readFileSync(sqlPath, "utf8");

const url = "https://supabase.com/dashboard/project/tajdfxphgeddfcswsham/sql/new";

try {
  if (process.platform === "win32") {
    execSync(`powershell -Command "Set-Clipboard -Value @'\n${sql.replace(/'/g, "''")}\n'@"`, {
      stdio: "ignore",
    });
    console.log("Migration SQL copied to clipboard.");
  }
} catch {
  console.log("Could not copy to clipboard — open the file manually:", sqlPath);
}

console.log("Open SQL Editor:", url);
try {
  execSync(`start "" "${url}"`, { stdio: "ignore", shell: true });
} catch {
  /* non-Windows */
}

console.log("After Run succeeds in SQL Editor, run: node scripts/setup-marketing-conversion.mjs");
