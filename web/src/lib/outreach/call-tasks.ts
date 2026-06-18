import type { SupabaseClient } from "@supabase/supabase-js";
import {
  brandingFromSettings,
  loadOutreachSettings,
  sectorAngleForProspect,
} from "@/lib/outreach/campaign-config";
import {
  formatCallScriptForCopy,
  generateCallPrep,
  type CallPrepTrigger,
} from "@/lib/outreach/llm-call-prep";
import { logTimelineEvent } from "@/lib/outreach/messages";
import { getPublicBaseUrl } from "@/lib/outreach/public-base-url";
import { sendOutreachAlerts } from "@/lib/outreach/send-alert";

export type CallTaskTrigger = CallPrepTrigger;

const CALL_INTENT_RE = /\b(call|phone|ring|speak|talk|callback)\b/i;

export function hasCallIntent(body: string): boolean {
  return CALL_INTENT_RE.test(body.trim());
}

export function qualificationChatUrl(token: string, req?: Request): string {
  const base = getPublicBaseUrl(req);
  return base ? `${base}/q/${token}` : `/q/${token}`;
}

function bookingUrlForProspect(
  campaign: string,
  prospectId: string,
  settings: Awaited<ReturnType<typeof loadOutreachSettings>>,
): string {
  const branding = brandingFromSettings(settings, campaign);
  const template = settings?.cta_url_template;
  if (template?.includes("{prospect_id}")) {
    return template.replace("{prospect_id}", prospectId);
  }
  return branding.ctaUrl.includes("?")
    ? `${branding.ctaUrl}&p=${prospectId}`
    : `${branding.ctaUrl}?p=${prospectId}`;
}

export type CallTaskRow = {
  id: string;
  prospect_id: string;
  status: string;
  trigger: string;
  opening_script: string;
  talking_points: unknown;
  objection_handling: unknown;
  suggested_next_step: string;
  booking_url: string;
  qualification_token: string;
  chat_transcript: unknown;
  qualification_outcome: string | null;
  operator_notes: string | null;
  due_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Create call prep task if none pending; idempotent. */
export async function createCallTaskIfNeeded(
  sb: SupabaseClient,
  prospectId: string,
  trigger: CallTaskTrigger,
  opts?: { req?: Request; skipAlert?: boolean },
): Promise<CallTaskRow | null> {
  const { data: existing } = await sb
    .from("outreach_call_tasks")
    .select("id")
    .eq("prospect_id", prospectId)
    .eq("status", "pending")
    .maybeSingle();

  if (existing?.id) return null;

  const { data: prospect } = await sb
    .from("outreach_prospects")
    .select("*")
    .eq("id", prospectId)
    .maybeSingle();

  if (!prospect) return null;

  const campaign = String(prospect.campaign || "pesttrace");
  const settings = await loadOutreachSettings(sb, campaign);

  const { data: lastMsg } = await sb
    .from("outreach_messages")
    .select("body_text")
    .eq("prospect_id", prospectId)
    .eq("direction", "inbound")
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const script = await generateCallPrep(
    {
      id: prospect.id,
      name: prospect.name || prospect.email || "Prospect",
      email: prospect.email,
      phone: prospect.phone,
      campaign,
      sector: prospect.sector,
      country: prospect.country,
      city: prospect.city,
      engagement_tier: prospect.engagement_tier,
      website_url: prospect.website_url,
      raw: prospect.raw as { research?: Record<string, unknown> } | null,
      lastInboundText: lastMsg?.body_text,
    },
    trigger,
    settings,
  );

  const due = new Date();
  due.setHours(due.getHours() + (trigger === "call_intent" ? 4 : 24));

  const bookingUrl = bookingUrlForProspect(campaign, prospectId, settings);

  const { data: row, error } = await sb
    .from("outreach_call_tasks")
    .insert({
      prospect_id: prospectId,
      trigger,
      opening_script: script.opening_script,
      talking_points: script.talking_points,
      objection_handling: script.objection_handling,
      suggested_next_step: script.suggested_next_step,
      booking_url: bookingUrl,
      due_at: due.toISOString(),
    })
    .select("*")
    .single();

  if (error || !row) return null;

  const chatUrl = qualificationChatUrl(row.qualification_token, opts?.req);

  await logTimelineEvent(sb, {
    prospectId,
    businessId: prospect.business_id,
    eventType: "call_task_created",
    title: "Call prep task created",
    detail: {
      trigger,
      chat_url: chatUrl,
      sector: sectorAngleForProspect(settings, prospect.sector),
    },
  });

  if (!opts?.skipAlert) {
    await sendOutreachAlerts(sb, "call_task", {
      prospectId,
      campaign,
      prospectName: prospect.name,
      prospectEmail: prospect.email,
      extra: [
        trigger === "call_intent" ? "Prospect asked to speak by phone." : "Prospect engaged — prepare for inbound call.",
        chatUrl ? `Qualification chat: ${chatUrl}` : null,
        prospect.phone ? `Phone: ${prospect.phone}` : null,
      ]
        .filter(Boolean)
        .join(" "),
    });
  }

  return row as CallTaskRow;
}

export { formatCallScriptForCopy };
