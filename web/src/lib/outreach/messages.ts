import type { SupabaseClient } from "@supabase/supabase-js";

export type MessageDirection = "outbound" | "inbound" | "draft";

export type InsertMessageInput = {
  prospectId: string;
  direction: MessageDirection;
  subject?: string | null;
  bodyText?: string | null;
  bodyHtml?: string | null;
  messageId?: string | null;
  inReplyTo?: string | null;
  status?: "sent" | "draft" | "failed";
  occurredAt?: string;
};

/** Insert message; skip if message_id already exists. */
export async function insertOutreachMessage(
  sb: SupabaseClient,
  input: InsertMessageInput,
): Promise<{ id: string | null; duplicate: boolean }> {
  if (input.messageId?.trim()) {
    const { data: existing } = await sb
      .from("outreach_messages")
      .select("id")
      .eq("message_id", input.messageId.trim())
      .maybeSingle();
    if (existing?.id) return { id: existing.id, duplicate: true };
  }

  const { data, error } = await sb
    .from("outreach_messages")
    .insert({
      prospect_id: input.prospectId,
      direction: input.direction,
      subject: input.subject ?? null,
      body_text: input.bodyText ?? null,
      body_html: input.bodyHtml ?? null,
      message_id: input.messageId?.trim() || null,
      in_reply_to: input.inReplyTo?.trim() || null,
      status: input.status ?? "sent",
      occurred_at: input.occurredAt ?? new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) return { id: null, duplicate: false };
  return { id: data.id, duplicate: false };
}

export async function logTimelineEvent(
  sb: SupabaseClient,
  input: {
    prospectId?: string | null;
    businessId?: string | null;
    eventType: string;
    title: string;
    detail?: Record<string, unknown>;
    occurredAt?: string;
  },
): Promise<void> {
  await sb.from("customer_timeline_events").insert({
    prospect_id: input.prospectId ?? null,
    business_id: input.businessId ?? null,
    event_type: input.eventType,
    title: input.title,
    detail: input.detail ?? {},
    occurred_at: input.occurredAt ?? new Date().toISOString(),
  });
}
