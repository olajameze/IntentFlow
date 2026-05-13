import { test, expect } from "@playwright/test";
import {
  approvePostViaServiceRole,
  deletePendingPost,
  getPostStatus,
  seedPendingPost,
} from "../helpers/supabase-seed";

test.describe.serial("Tier B — approvals UI + Supabase rows @integration", () => {
  test("Approve button updates row to approved via PATCH", async ({ page }) => {
    let id = "";
    try {
      ({ id } = await seedPendingPost());

      await page.goto("/approvals");
      await expect(page.getByRole("heading", { name: /Pending approvals/i })).toBeVisible();

      const card = page.locator(`[data-testid="pending-post-card"][data-post-id="${id}"]`);
      await expect(card.getByText(/^e2e /)).toBeVisible();
      // "Publish approved" contains substring "Approve" — require exact accessible name
      await card.getByRole("button", { name: "Approve", exact: true }).click();

      await expect.poll(async () => getPostStatus(id)).toBe("approved");
    } finally {
      if (id) await deletePendingPost(id);
    }
  });

  test("Reject button updates row to rejected", async ({ page }) => {
    let id = "";
    try {
      ({ id } = await seedPendingPost());

      await page.goto("/approvals");
      const card = page.locator(`[data-testid="pending-post-card"][data-post-id="${id}"]`);
      await expect(card.getByText(/^e2e /)).toBeVisible();
      await card.getByRole("button", { name: "Reject", exact: true }).click();

      await expect.poll(async () => getPostStatus(id)).toBe("rejected");
    } finally {
      if (id) await deletePendingPost(id);
    }
  });

  test("POST /api/publish-approved marks LinkedIn drafts published (local note)", async ({ request }) => {
    let id = "";
    try {
      ({ id } = await seedPendingPost());
      await approvePostViaServiceRole(id);

      expect(await getPostStatus(id)).toBe("approved");

      const res = await request.post("/api/publish-approved", {
        data: { id },
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status()).toBe(200);
      const body = (await res.json()) as { ok?: boolean; note?: string };
      expect(body.ok).toBe(true);
      expect(String(body.note ?? "").toLowerCase()).toContain("linkedin");

      await expect.poll(async () => getPostStatus(id)).toBe("published");
    } finally {
      if (id) await deletePendingPost(id);
    }
  });

  test("POST /api/publish-approved for facebook — 400 / 502 / 200 depending on env @integration", async ({
    request,
  }) => {
    let id = "";
    try {
      ({ id } = await seedPendingPost({ platform: "facebook" }));
      await approvePostViaServiceRole(id);

      const res = await request.post("/api/publish-approved", {
        data: { id },
        headers: { "Content-Type": "application/json" },
      });
      const body = await res.json().catch(() => ({}));
      const status = res.status();
      // Next loads FACEBOOK_* from .env.local; Playwright worker env may differ — assert outcomes only.
      expect([200, 400, 502]).toContain(status);
      if (status === 400) {
        expect(String((body as { error?: unknown }).error ?? "").toLowerCase()).toContain("facebook");
      }
      if (status === 502) {
        expect(
          String((body as { error?: unknown }).error ?? "").length,
        ).toBeGreaterThan(0);
      }
      if (status === 200) {
        expect((body as { ok?: boolean }).ok).toBe(true);
      }
    } finally {
      if (id) await deletePendingPost(id);
    }
  });
});
