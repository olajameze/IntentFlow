import { NextResponse } from "next/server";
import { checkClarityApiToken, claritySnapshotDays, fetchClarityLiveInsights } from "@/lib/clarity-client";
import { businessHasClarityToken, clarityApiTokenForBusiness } from "@/lib/clarity-token";
import { withSupabaseRoute } from "@/lib/with-supabase-route";

const BIZ_SELECT =
  "id, name, clarity_project_id, clarity_api_token_ciphertext, clarity_api_token_iv, clarity_api_token_tag";

/**
 * POST /api/clarity-sync
 * Pull Clarity live insights for each active business (max 3-day window per API limits).
 */
export async function POST() {
  return withSupabaseRoute(async (sb) => {
    const { data: businesses, error: bizErr } = await sb
      .from("businesses")
      .select(BIZ_SELECT)
      .eq("active", true);

    if (bizErr) {
      return NextResponse.json({ error: bizErr.message }, { status: 500 });
    }

    const hasGlobal = Boolean((process.env.CLARITY_API_TOKEN || "").trim());
    const hasAnyVaulted = (businesses ?? []).some((b) => businessHasClarityToken(b));
    if (!hasGlobal && !hasAnyVaulted) {
      return NextResponse.json(
        {
          error: "Clarity not configured",
          hint:
            "Save a Data Export API token per brand in Settings, or set CLARITY_API_TOKEN in web/.env.local as a fallback.",
        },
        { status: 503 },
      );
    }

    const days = claritySnapshotDays();
    const capturedAt = new Date().toISOString();
    const results: { name: string; ok: boolean; detail?: string }[] = [];

    for (const biz of businesses ?? []) {
      const pid = (biz.clarity_project_id as string | null)?.trim();
      if (!pid) {
        results.push({ name: String(biz.name), ok: false, detail: "no clarity_project_id" });
        continue;
      }
      const token = clarityApiTokenForBusiness(biz);
      if (!token) {
        results.push({
          name: String(biz.name),
          ok: false,
          detail: "no Clarity API token (save in Settings or set CLARITY_API_TOKEN)",
        });
        continue;
      }
      try {
        const stats = await fetchClarityLiveInsights(pid, days, token);
        const { error: insErr } = await sb.from("analytics_snapshots").insert({
          business_id: biz.id,
          source: "clarity",
          website_id: pid,
          payload: stats,
          captured_at: capturedAt,
        });
        if (insErr) {
          results.push({ name: String(biz.name), ok: false, detail: insErr.message });
        } else {
          results.push({ name: String(biz.name), ok: true });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Clarity fetch failed";
        results.push({ name: String(biz.name), ok: false, detail: msg });
      }
    }

    const synced = results.filter((r) => r.ok).length;
    return NextResponse.json({
      ok: synced > 0,
      synced,
      windowDays: days,
      capturedAt,
      results,
    });
  });
}

export async function GET() {
  return withSupabaseRoute(async (sb) => {
    const hasGlobal = Boolean((process.env.CLARITY_API_TOKEN || "").trim());
    const { data: businesses } = await sb.from("businesses").select(BIZ_SELECT).eq("active", true);
    const vaulted = (businesses ?? []).filter((b) => businessHasClarityToken(b)).length;
    const configured = hasGlobal || vaulted > 0;

    if (!configured) {
      return NextResponse.json({
        configured: false,
        keyValid: false,
        vaultedBrands: 0,
        windowDays: claritySnapshotDays(),
        hint: "Save a Clarity Data Export token per brand in Settings (recommended).",
      });
    }

    const sample =
      (businesses ?? []).find((b) => businessHasClarityToken(b) && String(b.clarity_project_id ?? "").trim()) ??
      (businesses ?? []).find((b) => String(b.clarity_project_id ?? "").trim());
    let keyValid = false;
    let keyMessage = hasGlobal
      ? "Global CLARITY_API_TOKEN set — per-brand tokens in Settings are preferred."
      : `${vaulted} brand(s) with vaulted Clarity tokens.`;

    if (sample?.clarity_project_id) {
      const token = clarityApiTokenForBusiness(sample);
      if (token) {
        const check = await checkClarityApiToken(String(sample.clarity_project_id), token);
        keyValid = check.ok;
        keyMessage = check.message;
      }
    }

    return NextResponse.json({
      configured: true,
      keyValid,
      keyMessage,
      vaultedBrands: vaulted,
      hasGlobalFallback: hasGlobal,
      windowDays: claritySnapshotDays(),
      dailyLimitPerProject: 10,
      maxLookbackDays: 3,
    });
  });
}
