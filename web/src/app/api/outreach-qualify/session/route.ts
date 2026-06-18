import { NextResponse } from "next/server";
import { brandingFromSettings, loadOutreachSettings } from "@/lib/outreach/campaign-config";
import { withSupabaseRoute } from "@/lib/with-supabase-route";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** GET — public session metadata for /q/[token] page. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token")?.trim() ?? "";
  if (!UUID_RE.test(token)) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  return withSupabaseRoute(async (sb) => {
    const { data: task } = await sb
      .from("outreach_call_tasks")
      .select(
        "id, opening_script, booking_url, chat_transcript, qualification_outcome, outreach_prospects(name, campaign)",
      )
      .eq("qualification_token", token)
      .maybeSingle();

    if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const prospect = task.outreach_prospects as { name?: string | null; campaign?: string } | null;
    const campaign = prospect?.campaign || "pesttrace";
    const settings = await loadOutreachSettings(sb, campaign);
    const branding = brandingFromSettings(settings, campaign);

    const transcript = Array.isArray(task.chat_transcript) ? task.chat_transcript : [];
    const done = Boolean(task.qualification_outcome);

    return NextResponse.json({
      campaign,
      brand_name: branding.headerLabel,
      accent: branding.accent,
      prospect_name: prospect?.name || "there",
      opening_script: task.opening_script,
      booking_url: task.booking_url,
      transcript,
      done,
      outcome: task.qualification_outcome,
    });
  });
}

export const dynamic = "force-dynamic";
