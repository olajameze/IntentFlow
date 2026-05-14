import path from "node:path";

import { config as loadEnv } from "dotenv";
import { defineConfig, devices } from "@playwright/test";

// Load local secrets for @integration suites (NEXT_PUBLIC_* + SERVICE_ROLE_KEY for seed helpers).
loadEnv({ path: path.resolve(__dirname, ".env.local") });

const integration = /^1|true$/i.test(process.env.PLAYWRIGHT_INTEGRATION ?? "");
const baseURL = process.env.BASE_URL || "http://127.0.0.1:3000";
const githubActionsCi = process.env.GITHUB_ACTIONS === "true";
// Turbopack (`npm run dev`) has been flaky on GitHub-hosted runners; webpack dev matches `dev:webpack` and is more stable for CI.
const webServerCommand = githubActionsCi
  ? "npm run dev:webpack -- --hostname 127.0.0.1 --port 3000"
  : "npm run dev -- --hostname 127.0.0.1 --port 3000";

function pickWebServerEnv(): Record<string, string> {
  const e: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === "string") e[k] = v;
  }
  e.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  e.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return e;
}

/**
 * Tier A+C+D — smoke + shells + APIs (excluding @integration suffix in describe titles).
 * Set PLAYWRIGHT_INTEGRATION=1 to run ONLY tests tagged `@integration` (Tier B seed + DB).
 *
 * Docs: https://playwright.dev/docs/test-configuration
 * Next.js: https://nextjs.org/docs/app/building-your-application/testing/playwright
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 75_000,
  fullyParallel: !integration,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: integration ? 1 : process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : "list",
  grep: integration ? /@integration\b/ : undefined,
  grepInvert: integration ? undefined : /@integration\b/,
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    navigationTimeout: 60_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: webServerCommand,
    url: baseURL,
    env: pickWebServerEnv(),
    // Local dev often already has `npm run dev` running — reuse it. GitHub Actions always starts fresh.
    reuseExistingServer: !githubActionsCi,
    timeout: githubActionsCi ? 240_000 : 180_000,
  },
});
