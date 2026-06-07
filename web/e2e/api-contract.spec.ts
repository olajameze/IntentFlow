import { test, expect } from "@playwright/test";

test.describe("Tier D — Route Handlers", () => {
  test("GET /api/health returns JSON with checks", async ({ request }) => {
    const res = await request.get("/api/health");
    const json = await res.json();
    expect(json).toMatchObject({
      checks: expect.objectContaining({
        nextPublicSupabaseUrl: expect.any(Boolean),
        supabaseServiceRoleConfigured: expect.any(Boolean),
        supabasePublishableConfigured: expect.any(Boolean),
      }),
      ok: expect.any(Boolean),
      status: expect.stringMatching(/ready|degraded/),
    });
    const httpStatus = res.status();
    expect([200, 503]).toContain(httpStatus);
    const configured =
      Boolean(json.checks?.nextPublicSupabaseUrl) &&
      Boolean(json.checks?.supabasePublishableConfigured) &&
      Boolean(json.checks?.supabaseServiceRoleConfigured);
    // Only strict-fail when secrets are present but DB/query still unhealthy (fork PRs often have no secrets).
    if (!json.ok && process.env.CI && process.env.ENFORCE_HEALTH_OK === "1" && configured) {
      const hint = typeof json.hint === "string" ? json.hint : "";
      throw new Error(
        `ENFORCE_HEALTH_OK=1 requires /api/health ok=true — check Supabase keys and DB (e.g. migrations). ${hint}`.trim(),
      );
    }
  });

  test("GET /api/businesses responds with JSON body", async ({ request }) => {
    const res = await request.get("/api/businesses");
    expect([200, 503]).toContain(res.status());
    const data = await res.json();
    if (res.ok()) {
      expect(Array.isArray(data)).toBe(true);
    } else {
      expect(data).toMatchObject({
        error: expect.any(String),
      });
      if (typeof data.hint === "string") expect(data.hint.length).toBeGreaterThan(0);
    }
  });

  test("POST /api/publish-approved rejects missing body id", async ({ request }) => {
    const res = await request.post("/api/publish-approved", {
      data: {},
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(400);
    const json = await res.json();
    expect(json.error).toBeTruthy();
  });

  test("GET /api/trigger-engine exposes GitHub PAT + repo booleans safely", async ({ request }) => {
    const res = await request.get("/api/trigger-engine");
    expect(res.ok()).toBeTruthy();
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.dispatchTokenConfigured).toEqual(expect.any(Boolean));
    expect(json.repoConfigured).toEqual(expect.any(Boolean));
    if (json.dispatchTokenConfigured) {
      expect(json.tokenShape).toEqual(expect.any(String));
    } else expect(json.tokenShape).toBeNull();
  });

  test("POST /api/outreach-conversion rejects invalid prospect_id", async ({ request }) => {
    const res = await request.post("/api/outreach-conversion", {
      data: { prospect_id: "not-a-uuid", event: "payment_completed" },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(400);
  });

  test("GET /api/outreach-prospects/stats includes funnel fields", async ({ request }) => {
    const res = await request.get("/api/outreach-prospects/stats?campaign=pesttrace");
    expect([200, 503]).toContain(res.status());
    if (res.ok()) {
      const json = await res.json();
      expect(json).toMatchObject({
        hot_leads: expect.any(Number),
        delivered: expect.any(Number),
        interested: expect.any(Number),
        meeting_booked: expect.any(Number),
        converted: expect.any(Number),
        revenue_attributed: expect.any(Number),
        engagement: expect.objectContaining({
          hot: expect.any(Number),
          warm: expect.any(Number),
          cold: expect.any(Number),
        }),
      });
    }
  });

  test("POST /api/outreach-webhooks/brevo rejects unsigned when secret configured", async ({ request }) => {
    if (!process.env.BREVO_WEBHOOK_SECRET?.trim()) {
      test.skip();
      return;
    }
    const res = await request.post("/api/outreach-webhooks/brevo", {
      data: { event: "delivered", email: "test@example.com" },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(401);
  });

  test("GET /api/health exposes outreach schema probe", async ({ request }) => {
    const res = await request.get("/api/health");
    const json = await res.json();
    expect(json.checks).toMatchObject({
      outreachSchemaReady: expect.any(Boolean),
    });
  });

  test("GET /api/trigger-traffic-sync exposes workflow + PAT + repo booleans safely", async ({ request }) => {
    const res = await request.get("/api/trigger-traffic-sync");
    expect(res.ok()).toBeTruthy();
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.workflowFile).toBe("traffic-revenue-sync.yml");
    expect(json.dispatchTokenConfigured).toEqual(expect.any(Boolean));
    expect(json.repoConfigured).toEqual(expect.any(Boolean));
    if (json.dispatchTokenConfigured) {
      expect(json.tokenShape).toEqual(expect.any(String));
    } else expect(json.tokenShape).toBeNull();
  });
});
