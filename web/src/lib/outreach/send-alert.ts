import type { SupabaseClient } from "@supabase/supabase-js";
import { sendOutreachEmail } from "@/lib/outreach/send-mail";

export type AlertEvent =
  | "reply"
  | "hot_lead"
  | "booked"
  | "converted"
  | "interested"
  | "meeting_booked"
  | "bounce_rate_high";

type AlertContext = {
  prospectId?: string;
  campaign: string;
  prospectName?: string | null;
  prospectEmail?: string | null;
  extra?: string;
};

function alertSubject(event: AlertEvent, ctx: AlertContext): string {
  const who = ctx.prospectName || ctx.prospectEmail || ctx.prospectId || "prospect";
  return `[IntentFlow] ${event.replace(/_/g, " ")} — ${ctx.campaign} — ${who}`;
}

function alertBody(event: AlertEvent, ctx: AlertContext): string {
  const lines = [
    `Event: ${event}`,
    `Campaign: ${ctx.campaign}`,
    ctx.prospectName ? `Name: ${ctx.prospectName}` : null,
    ctx.prospectEmail ? `Email: ${ctx.prospectEmail}` : null,
    ctx.prospectId ? `Prospect ID: ${ctx.prospectId}` : null,
    ctx.extra ? `Detail: ${ctx.extra}` : null,
    "",
    "Open IntentFlow → Outreach → Inbox to respond.",
  ].filter(Boolean);
  return lines.join("\n");
}

/** Send email alerts matching enabled rules (deduped per day). */
export async function sendOutreachAlerts(
  sb: SupabaseClient,
  event: AlertEvent,
  ctx: AlertContext,
): Promise<number> {
  const fallbackTo = process.env.OUTREACH_ALERT_TO_EMAIL?.trim();
  const fromCampaign = ctx.campaign !== "all" ? ctx.campaign : "pesttrace";

  const { data: rules } = await sb
    .from("outreach_alert_rules")
    .select("*")
    .eq("enabled", true);

  if (!rules?.length) {
    if (!fallbackTo) return 0;
    try {
      await sendOutreachEmail(
        fromCampaign,
        fallbackTo,
        alertSubject(event, ctx),
        `<pre>${alertBody(event, ctx)}</pre>`,
        alertBody(event, ctx),
      );
      return 1;
    } catch {
      return 0;
    }
  }

  let sent = 0;
  const subject = alertSubject(event, ctx);
  const plain = alertBody(event, ctx);
  const html = `<pre>${plain.replace(/</g, "&lt;")}</pre>`;

  for (const rule of rules) {
    const events = (rule.events as string[]) ?? [];
    const campaignOk = rule.campaign === "all" || rule.campaign === ctx.campaign;
    if (!campaignOk || !events.includes(event)) continue;

    const recipients = (rule.to_emails as string[])?.filter(Boolean) ?? [];
    if (!recipients.length) continue;

    if (ctx.prospectId) {
      const today = new Date().toISOString().slice(0, 10);
      const { data: dup } = await sb
        .from("outreach_alert_log")
        .select("id")
        .eq("rule_id", rule.id)
        .eq("prospect_id", ctx.prospectId)
        .eq("event", event)
        .gte("sent_at", `${today}T00:00:00Z`)
        .maybeSingle();
      if (dup) continue;
    }

    for (const to of recipients) {
      try {
        await sendOutreachEmail(fromCampaign, to, subject, html, plain);
        sent += 1;
      } catch {
        /* continue */
      }
    }

    await sb.from("outreach_alert_log").insert({
      rule_id: rule.id,
      prospect_id: ctx.prospectId ?? null,
      event,
    });
  }

  return sent;
}
