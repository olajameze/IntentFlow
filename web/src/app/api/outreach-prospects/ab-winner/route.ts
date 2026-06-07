import { NextResponse } from "next/server";
import { pickAbWinner } from "@/lib/outreach/ab-winner";
import { withSupabaseRoute } from "@/lib/with-supabase-route";

/** POST — daily A/B subject winner selection (cron). */
export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  if (expected) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const { searchParams } = new URL(req.url);
  const campaign = (searchParams.get("campaign") || "pesttrace").trim().toLowerCase();

  return withSupabaseRoute(async (sb) => {
    const { data: prospects } = await sb
      .from("outreach_prospects")
      .select("subject_variant, opened_at, replied_at")
      .eq("campaign", campaign)
      .eq("status", "sent");

    const rows = prospects ?? [];
    const variantA = {
      variant: "A" as const,
      sent: rows.filter((r) => r.subject_variant === "A" || !r.subject_variant).length,
      opened: rows.filter((r) => (r.subject_variant === "A" || !r.subject_variant) && r.opened_at).length,
      replied: rows.filter((r) => (r.subject_variant === "A" || !r.subject_variant) && r.replied_at).length,
    };
    const variantB = {
      variant: "B" as const,
      sent: rows.filter((r) => r.subject_variant === "B").length,
      opened: rows.filter((r) => r.subject_variant === "B" && r.opened_at).length,
      replied: rows.filter((r) => r.subject_variant === "B" && r.replied_at).length,
    };

    const result = pickAbWinner(variantA, variantB);
    if (!result.winner) {
      return NextResponse.json({ ok: true, campaign, ...result });
    }

    const key = `outreach_ab_winner_${campaign}`;
    await sb.from("app_settings").upsert(
      {
        key,
        value: { winner: result.winner, confidence: result.confidence, updated_at: new Date().toISOString() },
      },
      { onConflict: "key" },
    );

    return NextResponse.json({ ok: true, campaign, ...result });
  });
}

export const dynamic = "force-dynamic";
