import type { SupabaseClient } from "@supabase/supabase-js";
import { syncProspectToHubSpot } from "@/lib/integrations/hubspot";
import { engagementUpdateFields } from "@/lib/outreach/engagement";
import { invalidateOutreachStats } from "@/lib/outreach/campaign-stats";
import { emitOutreachWebhooks } from "@/lib/outreach/emit-webhook";
import { logTimelineEvent } from "@/lib/outreach/messages";
import { enrollInNurture } from "@/lib/outreach/nurture";
import { sendOutreachAlerts } from "@/lib/outreach/send-alert";

export type ConversionEventType =
  | "booking_started"
  | "payment_completed"
  | "trial_started"
  | "deposit_paid";

const INTERESTED_EVENTS: ConversionEventType[] = ["trial_started"];

const CONVERTED_EVENTS: ConversionEventType[] = [
  "payment_completed",
  "deposit_paid",
];

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
  interested_at?: string | null;
  meeting_booked_at?: string | null;
  converted_at?: string | null;
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
  const eventType = params.event as ConversionEventType;
  const updates: Record<string, unknown> = { updated_at: now };

  if (eventType === "booking_started" && !prospect.meeting_booked_at) {
    updates.meeting_booked_at = now;
    await sb.from("outreach_email_events").insert({
      prospect_id: prospect.id,
      campaign: prospect.campaign,
      event_type: "meeting_booked",
    });
    await emitOutreachWebhooks(sb, {
      event: "meeting_booked",
      campaign: prospect.campaign,
      prospectId: prospect.id,
      email: prospect.email ?? undefined,
    });
  }

  if (INTERESTED_EVENTS.includes(eventType) && !prospect.interested_at) {
    updates.interested_at = now;
    await sb.from("outreach_email_events").insert({
      prospect_id: prospect.id,
      campaign: prospect.campaign,
      event_type: "interested",
    });
    await emitOutreachWebhooks(sb, {
      event: "interested",
      campaign: prospect.campaign,
      prospectId: prospect.id,
      email: prospect.email ?? undefined,
    });
  }

  if (CONVERTED_EVENTS.includes(eventType) && !prospect.converted_at) {
    updates.converted_at = now;
    await sb.from("outreach_email_events").insert({
      prospect_id: prospect.id,
      campaign: prospect.campaign,
      event_type: "converted",
    });
  }

  if (countsAsBooked && !prospect.booked_at) {
    const tierFields = engagementUpdateFields({
      ...prospect,
      booked_at: now,
    });

    await sb
      .from("outreach_prospects")
      .update({
        booked_at: now,
        ...updates,
        ...tierFields,
      })
      .eq("id", prospect.id);

    await sb.from("outreach_email_events").insert({
      prospect_id: prospect.id,
      campaign: prospect.campaign,
      event_type: "booked",
    });

    await emitOutreachWebhooks(sb, {
      event: "booked",
      campaign: prospect.campaign,
      prospectId: prospect.id,
      email: prospect.email ?? undefined,
    });
    if (updates.converted_at) {
      await emitOutreachWebhooks(sb, {
        event: "converted",
        campaign: prospect.campaign,
        prospectId: prospect.id,
        email: prospect.email ?? undefined,
      });
    }

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

    await logTimelineEvent(sb, {
      prospectId: prospect.id,
      businessId: prospect.business_id,
      eventType: "converted",
      title: "Conversion recorded",
      detail: { event: params.event, amount: params.amount, currency: params.currency },
      occurredAt: now,
    });

    await sendOutreachAlerts(sb, "booked", {
      prospectId: prospect.id,
      campaign: prospect.campaign,
      prospectName: prospect.name,
      prospectEmail: prospect.email,
      extra: params.event,
    });
    if (updates.converted_at) {
      await sendOutreachAlerts(sb, "converted", {
        prospectId: prospect.id,
        campaign: prospect.campaign,
        prospectName: prospect.name,
        prospectEmail: prospect.email,
      });
    }

    await enrollInNurture(sb, prospect.id, prospect.campaign);
    void syncProspectToHubSpot(sb, {
      id: prospect.id,
      email: prospect.email,
      name: prospect.name,
      campaign: prospect.campaign,
      interested_at: (updates.interested_at as string) ?? prospect.interested_at,
      meeting_booked_at: (updates.meeting_booked_at as string) ?? prospect.meeting_booked_at,
      booked_at: now,
      converted_at: (updates.converted_at as string) ?? prospect.converted_at,
    });

    invalidateOutreachStats(prospect.campaign);
    return { booked: true, duplicate: false };
  }

  const tierFields = engagementUpdateFields(prospect);
  if (Object.keys(updates).length > 1) {
    await sb
      .from("outreach_prospects")
      .update({ ...updates, ...tierFields })
      .eq("id", prospect.id);
  } else {
    await sb
      .from("outreach_prospects")
      .update({ ...tierFields, updated_at: now })
      .eq("id", prospect.id);
  }

  invalidateOutreachStats(prospect.campaign);
  return { booked: !!prospect.booked_at, duplicate: false };
}
