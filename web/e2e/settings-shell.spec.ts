import { test, expect } from "@playwright/test";

test.describe("Tier C — settings workspace", () => {
  test("renders Add business form and Active portfolio sections", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /^Settings$/i })).toBeVisible({ timeout: 45_000 });
    await expect(page.locator('[data-slot="card-title"]').getByText("Add business")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[data-slot="card-title"]').getByText("Active portfolio")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Save business" })).toBeVisible({ timeout: 20_000 });
  });
});
