import fs from "fs";
import path from "path";

const MIGRATION_FILES = [
  "20260604000000_business_outreach.sql",
  "20260607000000_outreach_intelligence.sql",
  "20260608000000_outreach_event_types.sql",
  "20260608100000_outreach_webhook_subscriptions.sql",
  "20260609000000_outreach_campaign_stats_rpc.sql",
  "20260610000000_outreach_snapshots.sql",
] as const;

export function outreachMigrationPaths(): string[] {
  const base = path.join(process.cwd(), "..", "supabase", "migrations");
  return MIGRATION_FILES.map((file) => path.join(base, file));
}

export function readOutreachMigrationsSql(): string {
  return outreachMigrationPaths()
    .map((p) => {
      if (!fs.existsSync(p)) throw new Error(`Migration file not found: ${p}`);
      return fs.readFileSync(p, "utf8");
    })
    .join("\n\n");
}
