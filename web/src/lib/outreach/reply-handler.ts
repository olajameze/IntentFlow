import type { SupabaseClient } from "@supabase/supabase-js";
import { syncProspectToHubSpot } from "@/lib/integrations/hubspot";
import { engagementUpdateFields } from "@/lib/outreach/engagement";
import { invalidateOutreachStats } from "@/lib/outreach/campaign-stats";
import { emitOutreachWebhooks } from "@/lib/outreach/emit-webhook";
import { insertOutreachMessage, logTimelineEvent } from "@/lib/outreach/messages";
import { createCallTaskIfNeeded, hasCallIntent } from "@/lib/outreach/call-tasks";
import { sendOutreachAlerts } from "@/lib/outreach/send-alert";
import { addToSuppressionList } from "@/lib/outreach/suppression";

const STOP_PATTERNS = [
  /\bstop\b/i,
  /\bunsubscribe\b/i,
  /\bopt\s*out\b/i,
  /\bremove\s+me\b/i,
  /\bdo\s+not\s+contact\b/i,
];

export function isUnsubscribeReply(body: string): boolean {
  const text = body.trim();
  if (!text) return false;
  return STOP_PATTERNS.some((re) => re.test(text));
}

export type ReplyHandlerInput = {
  prospectId: string;
  campaign: string;
  fromEmail: string;
  bodyText: string;
  subject?: string;
  messageId?: string;
  inReplyTo?: string;
};

/** Process inbound reply — stop sequence, log event, persist message, alert ops. */
export async function handleInboundReply(
  sb: SupabaseClient,
  input: ReplyHandlerInput,
): Promise<{ ok: boolean; unsubscribed: boolean }> {
  const now = new Date().toISOString();
  const unsubscribed = isUnsubscribeReply(input.bodyText);

  const { data: prospect } = await sb
    .from("outreach_prospects")
    .select("*")
    .eq("id", input.prospectId)
    .maybeSingle();

  if (!prospect) return { ok: false, unsubscribed: false };

  const isFirstReply = !prospect.replied_at;

  await insertOutreachMessage(sb, {
    prospectId: input.prospectId,
    direction: "inbound",
    subject: input.subject,
    bodyText: input.bodyText,
    messageId: input.messageId,
    inReplyTo: input.inReplyTo,
    occurredAt: now,
  });

  const tierFields = engagementUpdateFields({
    ...prospect,
    booked_at: prospect.booked_at,
    clicked_at: prospect.clicked_at ?? now,
    click_count: (prospect.click_count ?? 0) + 1,
  });

  const updates: Record<string, unknown> = {
    replied_at: prospect.replied_at ?? now,
    next_send_at: null,
    updated_at: now,
    ...tierFields,
  };

  if (unsubscribed) {
    updates.status = "unsubscribed";
    await addToSuppressionList(sb, input.fromEmail || prospect.email, "unsubscribe", input.campaign);
  }

  await sb.from("outreach_prospects").update(updates).eq("id", input.prospectId);

  if (isFirstReply) {
    await sb.from("outreach_email_events").insert({
      prospect_id: input.prospectId,
      campaign: input.campaign,
      event_type: unsubscribed ? "unsubscribe" : "reply",
    });
  }

  await logTimelineEvent(sb, {
    prospectId: input.prospectId,
    businessId: prospect.business_id,
    eventType: unsubscribed ? "unsubscribe" : "reply",
    title: unsubscribed ? "Prospect unsubscribed" : "Prospect replied",
    detail: { subject: input.subject, preview: input.bodyText.slice(0, 200) },
    occurredAt: now,
  });

  await emitOutreachWebhooks(sb, {
    event: unsubscribed ? "unsubscribe" : "reply",
    campaign: input.campaign,
    prospectId: input.prospectId,
    email: input.fromEmail || prospect.email,
  });

  if (isFirstReply && !unsubscribed) {
    await sendOutreachAlerts(sb, "reply", {
      prospectId: input.prospectId,
      campaign: input.campaign,
      prospectName: prospect.name,
      prospectEmail: prospect.email,
    });

    const callTrigger = hasCallIntent(input.bodyText) ? "call_intent" : "reply";
    await createCallTaskIfNeeded(sb, input.prospectId, callTrigger);
  }

  if (prospect.email) {
    void syncProspectToHubSpot(sb, {
      id: prospect.id,
      email: prospect.email,
      name: prospect.name,
      campaign: prospect.campaign,
      phone: prospect.phone,
      city: prospect.city,
      country: prospect.country,
      interested_at: prospect.interested_at,
      meeting_booked_at: prospect.meeting_booked_at,
      booked_at: prospect.booked_at ?? now,
      converted_at: prospect.converted_at,
    });
  }

  invalidateOutreachStats(input.campaign);

  return { ok: true, unsubscribed };
}
