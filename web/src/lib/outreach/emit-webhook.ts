import { createHmac } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { outreachLog } from "@/lib/outreach/logger";

export type WebhookEmitEvent =
  | "reply"
  | "booked"
  | "converted"
  | "hot_lead"
  | "unsubscribe"
  | "interested"
  | "meeting_booked";

type EmitParams = {
  event: WebhookEmitEvent;
  campaign: string;
  prospectId: string;
  email?: string;
  payload?: Record<string, unknown>;
};

export async function emitOutreachWebhooks(
  sb: SupabaseClient,
  params: EmitParams,
): Promise<void> {
  const { data: subs } = await sb
    .from("outreach_webhook_subscriptions")
    .select("*")
    .eq("enabled", true);

  if (!subs?.length) return;

  const body = JSON.stringify({
    event: params.event,
    campaign: params.campaign,
    prospect_id: params.prospectId,
    email: params.email,
    occurred_at: new Date().toISOString(),
    ...params.payload,
  });

  for (const sub of subs) {
    const events = Array.isArray(sub.events) ? sub.events : [];
    const campaignMatch =
      sub.campaign === "all" || sub.campaign === params.campaign;
    if (!campaignMatch || !events.includes(params.event)) continue;

    const signature = createHmac("sha256", String(sub.secret)).update(body).digest("hex");

    try {
      const res = await fetch(String(sub.url), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-IntentFlow-Signature": signature,
          "X-IntentFlow-Event": params.event,
        },
        body,
      });
      if (!res.ok) {
        outreachLog({
          level: "warn",
          event: "outbound_webhook_failed",
          campaign: params.campaign,
          prospectId: params.prospectId,
          issues: [`${sub.url} returned ${res.status}`],
        });
      }
    } catch (err) {
      outreachLog({
        level: "warn",
        event: "outbound_webhook_error",
        campaign: params.campaign,
        prospectId: params.prospectId,
        issues: [err instanceof Error ? err.message : "fetch failed"],
      });
    }
  }
}
