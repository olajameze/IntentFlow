import { NextResponse } from "next/server";
import { isConfiguredForCampaign } from "@/lib/outreach/campaign-env";
import { insertOutreachMessage } from "@/lib/outreach/messages";
import { sendOutreachEmail } from "@/lib/outreach/send-mail";
import { logOperatorAudit } from "@/lib/auth/operator";
import { withSupabaseRoute } from "@/lib/with-supabase-route";

type Params = { params: { prospectId: string } };

/** POST { subject, body } — operator reply from inbox */
export async function POST(req: Request, { params }: Params) {
  const prospectId = params.prospectId?.trim();
  if (!prospectId) return NextResponse.json({ error: "prospectId required" }, { status: 400 });

  const json = (await req.json().catch(() => ({}))) as { subject?: string; body?: string };
  const subject = String(json.subject || "").trim();
  const body = String(json.body || "").trim();
  if (!subject || !body) {
    return NextResponse.json({ error: "subject and body required" }, { status: 400 });
  }

  return withSupabaseRoute(async (sb) => {
    const { data: prospect, error } = await sb
      .from("outreach_prospects")
      .select("*")
      .eq("id", prospectId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!prospect?.email) return NextResponse.json({ error: "Prospect not found" }, { status: 404 });

    const campaign = String(prospect.campaign || "pesttrace");
    const check = isConfiguredForCampaign(campaign);
    if (!check.ok) {
      return NextResponse.json({ error: check.hint || "Sender not configured" }, { status: 400 });
    }

    const html = `<div style="font-family:sans-serif;line-height:1.5">${body.replace(/\n/g, "<br/>")}</div>`;
    const sendResult = await sendOutreachEmail(campaign, prospect.email, subject, html, body, {
      prospectId,
    });

    const now = new Date().toISOString();
    await insertOutreachMessage(sb, {
      prospectId,
      direction: "outbound",
      subject,
      bodyText: body,
      bodyHtml: html,
      messageId: sendResult.messageId,
      occurredAt: now,
    });

    await logOperatorAudit(sb, {
      action: "inbox_reply_sent",
      resourceType: "outreach_prospect",
      resourceId: prospectId,
      detail: { subject, campaign },
    });

    return NextResponse.json({ ok: true, messageId: sendResult.messageId });
  });
}

export const dynamic = "force-dynamic";
