import { NextResponse } from "next/server";
import { isConfiguredForCampaign } from "@/lib/outreach/campaign-env";
import { renderNurtureTemplate } from "@/lib/outreach/nurture";
import { sendOutreachEmail } from "@/lib/outreach/send-mail";
import { checkSuppressionBeforeSend } from "@/lib/outreach/suppression";
import { withSupabaseRoute } from "@/lib/with-supabase-route";

/** POST — cron nurture send */
export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  if (expected) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const now = new Date().toISOString();

  return withSupabaseRoute(async (sb) => {
    const { data: due, error } = await sb
      .from("outreach_nurture_enrollments")
      .select("*, outreach_prospects(*)")
      .is("completed_at", null)
      .lte("next_send_at", now)
      .limit(25);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!due?.length) return NextResponse.json({ ok: true, sent: 0 });

    let sent = 0;
    for (const row of due) {
      const prospect = (row as { outreach_prospects?: Record<string, unknown> }).outreach_prospects;
      if (!prospect?.email) continue;

      const campaign = String(row.campaign || prospect.campaign || "pesttrace");
      const blocked = await checkSuppressionBeforeSend(sb, String(prospect.email), campaign);
      if (blocked.blocked) continue;

      const { data: seq } = await sb
        .from("outreach_nurture_sequences")
        .select("*")
        .eq("campaign", campaign)
        .eq("step", row.step)
        .eq("active", true)
        .maybeSingle();
      if (!seq) {
        await sb
          .from("outreach_nurture_enrollments")
          .update({ completed_at: now })
          .eq("id", row.id);
        continue;
      }

      if (!isConfiguredForCampaign(campaign).ok) continue;

      const subject = renderNurtureTemplate(seq.subject_template, {
        name: String(prospect.name || ""),
        email: String(prospect.email || ""),
      });
      const body = renderNurtureTemplate(seq.body_template, {
        name: String(prospect.name || ""),
        email: String(prospect.email || ""),
      });
      const html = `<div>${body.replace(/\n/g, "<br/>")}</div>`;

      try {
        await sendOutreachEmail(campaign, String(prospect.email), subject, html, body);
        sent += 1;
      } catch {
        continue;
      }

      const { data: nextSeq } = await sb
        .from("outreach_nurture_sequences")
        .select("step, offset_days")
        .eq("campaign", campaign)
        .eq("step", row.step + 1)
        .eq("active", true)
        .maybeSingle();

      if (nextSeq) {
        const nextAt = new Date();
        nextAt.setDate(nextAt.getDate() + (nextSeq.offset_days ?? 7));
        await sb
          .from("outreach_nurture_enrollments")
          .update({ step: nextSeq.step, next_send_at: nextAt.toISOString() })
          .eq("id", row.id);
      } else {
        await sb
          .from("outreach_nurture_enrollments")
          .update({ completed_at: now })
          .eq("id", row.id);
      }
    }

    return NextResponse.json({ ok: true, sent });
  });
}

export const dynamic = "force-dynamic";
