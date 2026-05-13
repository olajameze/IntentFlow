import { test, expect } from "@playwright/test";

const dashboardPaths = [
  { path: "/", heading: /Command centre/i },
  { path: "/traffic", heading: /Traffic intelligence/i },
  { path: "/revenue", heading: /Revenue intelligence/i },
  { path: "/analytics", heading: /Portfolio analytics/i },
  { path: "/approvals", heading: /Pending approvals/i },
  { path: "/settings", heading: /^Settings$/i },
] as const;

test.describe("Tier A — dashboard shell", () => {
  test.describe.configure({ timeout: 120_000 });

  test("shows IntentFlow nav on desktop layouts", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("IntentFlow").first()).toBeVisible({ timeout: 30_000 });
  });

  for (const row of dashboardPaths) {
    test(`GET ${row.path} loads primary heading`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto(row.path, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: row.heading }).first()).toBeVisible({ timeout: 90_000 });
    });
  }

  test("theme toggle responds without crashing", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Toggle theme" }).click();
    await expect(page.getByRole("heading", { name: /Command centre/i })).toBeVisible({ timeout: 30_000 });
  });

  test("mobile bottom nav exposes Home", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/traffic", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("navigation", { name: "Mobile primary" })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Home$/ })).toBeVisible();
  });

  test("/todos SSR demo loads", async ({ page }) => {
    await page.goto("/todos", { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1").filter({ hasText: /Todos/ })).toBeVisible({ timeout: 45_000 });
  });
});
