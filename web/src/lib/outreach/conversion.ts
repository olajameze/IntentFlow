import type { SupabaseClient } from "@supabase/supabase-js";
import { engagementUpdateFields } from "@/lib/outreach/engagement";

export type ConversionEventType =
  | "booking_started"
  | "payment_completed"
  | "trial_started"
  | "deposit_paid";

const BOOKING_EVENTS: ConversionEventType[] = [
  "payment_completed",
  "trial_started",
  "deposit_paid",
];

export function eventCountsAsBooked(
  event: string,
  depositPaid?: boolean,
): boolean {
  if (BOOKING_EVENTS.includes(event as ConversionEventType)) return true;
  if (event === "booking_started" && depositPaid === true) return true;
  return false;
}

type ProspectRow = {
  id: string;
  campaign: string;
  business_id: string | null;
  name: string | null;
  email: string | null;
  booked_at: string | null;
  opened_at?: string | null;
  clicked_at?: string | null;
  open_count?: number | null;
  click_count?: number | null;
};

/** Record conversion from brand-site webhook; idempotent on external_id. */
export async function recordOutreachConversion(
  sb: SupabaseClient,
  prospect: ProspectRow,
  params: {
    event: string;
    external_id?: string;
    amount?: number;
    currency?: string;
    deposit_paid?: boolean;
  },
): Promise<{ booked: boolean; duplicate: boolean }> {
  const externalId =
    params.external_id?.trim() ||
    `${params.event}:${prospect.id}:${new Date().toISOString().slice(0, 10)}`;

  if (params.external_id) {
    const { data: existing } = await sb
      .from("outreach_conversion_receipts")
      .select("id")
      .eq("prospect_id", prospect.id)
      .eq("external_id", externalId)
      .maybeSingle();
    if (existing) return { booked: !!prospect.booked_at, duplicate: true };
  }

  await sb.from("outreach_conversion_receipts").insert({
    prospect_id: prospect.id,
    external_id: externalId,
    event_type: params.event,
    amount: params.amount ?? null,
    currency: params.currency ?? null,
  });

  const countsAsBooked = eventCountsAsBooked(params.event, params.deposit_paid);
  const now = new Date().toISOString();

  if (countsAsBooked && !prospect.booked_at) {
    const tierFields = engagementUpdateFields({
      ...prospect,
      booked_at: now,
    });

    await sb
      .from("outreach_prospects")
      .update({
        booked_at: now,
        ...tierFields,
        updated_at: now,
      })
      .eq("id", prospect.id);

    await sb.from("outreach_email_events").insert({
      prospect_id: prospect.id,
      campaign: prospect.campaign,
      event_type: "booked",
    });

    if (prospect.business_id && prospect.email) {
      const { data: existingLead } = await sb
        .from("leads")
        .select("id")
        .eq("business_id", prospect.business_id)
        .eq("email", prospect.email)
        .maybeSingle();

      if (existingLead?.id) {
        await sb.from("leads").update({ status: "converted" }).eq("id", existingLead.id);
      } else {
        await sb.from("leads").insert({
          business_id: prospect.business_id,
          source: "outreach",
          name: prospect.name,
          email: prospect.email,
          status: "converted",
          metadata: { prospect_id: prospect.id, event: params.event },
        });
      }
    }

    return { booked: true, duplicate: false };
  }

  const tierFields = engagementUpdateFields(prospect);
  await sb
    .from("outreach_prospects")
    .update({ ...tierFields, updated_at: now })
    .eq("id", prospect.id);

  return { booked: !!prospect.booked_at, duplicate: false };
}
