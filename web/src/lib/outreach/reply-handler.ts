import type { SupabaseClient } from "@supabase/supabase-js";
import { engagementUpdateFields } from "@/lib/outreach/engagement";
import { emitOutreachWebhooks } from "@/lib/outreach/emit-webhook";

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
};

/** Process inbound reply — stop sequence, log event, optional unsubscribe. */
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
  }

  await sb.from("outreach_prospects").update(updates).eq("id", input.prospectId);

  await sb.from("outreach_email_events").insert({
    prospect_id: input.prospectId,
    campaign: input.campaign,
    event_type: unsubscribed ? "unsubscribe" : "reply",
  });

  await emitOutreachWebhooks(sb, {
    event: unsubscribed ? "unsubscribe" : "reply",
    campaign: input.campaign,
    prospectId: input.prospectId,
    email: input.fromEmail,
  });

  return { ok: true, unsubscribed };
}
