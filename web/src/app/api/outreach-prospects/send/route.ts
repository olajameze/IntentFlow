import { NextResponse } from "next/server";
import { loadAbWinner } from "@/lib/outreach/ab-winner";
import { invalidateOutreachStats } from "@/lib/outreach/campaign-stats";
import {
  getBaseConfig,
  getDailyLimit,
  getEmailProvider,
  isConfiguredForCampaign,
  pickSubjectVariant,
} from "@/lib/outreach/campaign-env";
import { verifyOutreachEmail } from "@/lib/outreach/email-verify";
import { nextFollowUpAt } from "@/lib/outreach/followup-schedule";
import { outreachLog } from "@/lib/outreach/logger";
import { getPublicBaseUrl } from "@/lib/outreach/public-base-url";
import { canSendThisHour, sendJitterMs, adjustSendTimeForSmartSend } from "@/lib/outreach/send-pacing";
import { stripAiMetaFromHtml } from "@/lib/outreach/email-validator";
import { validateEmailForSend } from "@/lib/outreach/send-validation";
import { sendOutreachEmail, verifySmtpForCampaign } from "@/lib/outreach/send-mail";
import { smtpTroubleshootingHint } from "@/lib/outreach/smtp-errors";
import { injectTracking } from "@/lib/outreach/tracking";
import { applySnapshotUrlToHtml } from "@/lib/outreach/snapshot-send";
import { checkSuppressionBeforeSend } from "@/lib/outreach/suppression";
import { insertOutreachMessage } from "@/lib/outreach/messages";
import { createLinkedInTaskIfNeeded } from "@/lib/outreach/nurture";
import { withSupabaseRoute } from "@/lib/with-supabase-route";

function normalizeCampaign(raw: unknown): string {
  return typeof raw === "string" && raw.trim() ? raw.trim().toLowerCase() : "pesttrace";
}

function isAllCampaigns(campaign: string): boolean {
  return campaign === "all";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sendFailurePayload(error: string, extra?: Record<string, unknown>) {
  const hint = smtpTroubleshootingHint(error);
  return { error, ...(hint ? { hint } : {}), ...extra };
}

/** GET ?campaign=pesttrace&verify=1 — outreach email config probe (no secrets). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const campaign = normalizeCampaign(url.searchParams.get("campaign"));
  const doVerify = url.searchParams.get("verify") === "1";
  const check = isConfiguredForCampaign(campaign);

  const base = getBaseConfig(campaign);
  const payload: Record<string, unknown> = {
    campaign,
    provider: getEmailProvider(),
    configured: check.ok,
    fromName: base.fromName,
    fromEmail: base.fromEmail,
    ...(check.hint ? { configHint: check.hint } : {}),
  };

  if (doVerify && check.ok && getEmailProvider() !== "resend") {
    const verify = await verifySmtpForCampaign(campaign);
    payload.smtpVerify = verify.ok ? "ok" : verify.error;
    if (!verify.ok) {
      const hint = smtpTroubleshootingHint(verify.error);
      if (hint) payload.hint = hint;
    }
  }

  return NextResponse.json(payload, { status: check.ok ? 200 : 503 });
}

/** POST { id } or { bulk: true, campaign? } — send approved prospect email(s). */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const bulk = body.bulk === true;
  const baseUrl = getPublicBaseUrl(req);

  return withSupabaseRoute(async (sb) => {
    const winnerCache = new Map<string, "A" | "B" | null>();
    const senderNameCache = new Map<string, string | null>();

    const senderFromNameFor = async (campaign: string): Promise<string | undefined> => {
      const key = campaign.trim().toLowerCase();
      if (!senderNameCache.has(key)) {
        const { data } = await sb
          .from("business_outreach_settings")
          .select("sender_from_name")
          .eq("campaign_slug", key)
          .maybeSingle();
        const name =
          typeof data?.sender_from_name === "string" && data.sender_from_name.trim()
            ? data.sender_from_name.trim()
            : null;
        senderNameCache.set(key, name);
      }
      const cached = senderNameCache.get(key);
      return cached ?? undefined;
    };

    const abWinnerFor = async (campaign: string) => {
      const key = campaign.trim().toLowerCase();
      if (!winnerCache.has(key)) {
        winnerCache.set(key, await loadAbWinner(sb, key));
      }
      return winnerCache.get(key) ?? null;
    };

    const sendOne = async (prospect: {
      id: string;
      email: string;
      email_subject: string | null;
      email_subject_b: string | null;
      email_body: string;
      campaign: string | null;
      country?: string | null;
      raw?: Record<string, unknown> | null;
    }) => {
      const campaign = normalizeCampaign(prospect.campaign);

      const configCheck = isConfiguredForCampaign(campaign);
      if (!configCheck.ok) {
        return {
          ok: false as const,
          status: 400,
          error: `Email sender is not configured for campaign '${campaign}'.`,
          skippedUnconfigured: true,
        };
      }

      const senderFromName = await senderFromNameFor(campaign);
      const sendIdentity = getBaseConfig(campaign, { fromName: senderFromName });

      const suppressed = await checkSuppressionBeforeSend(sb, prospect.email, campaign);
      if (suppressed.blocked) {
        return {
          ok: false as const,
          status: 422,
          error: `Email suppressed (${suppressed.reason ?? "listed"})`,
        };
      }

      const hourly = await canSendThisHour(sb, campaign);
      if (!hourly.ok) {
        outreachLog({ level: "warn", event: "hourly_cap_reached", campaign, issues: [hourly.reason ?? ""] });
        return { ok: false as const, status: 429, error: hourly.reason ?? "Hourly cap reached" };
      }

      const verify = await verifyOutreachEmail(prospect.email);
      if (!verify.ok) {
        const raw = (prospect.raw && typeof prospect.raw === "object" ? prospect.raw : {}) as Record<
          string,
          unknown
        >;
        await sb
          .from("outreach_prospects")
          .update({
            status: "bounced",
            raw: { ...raw, verify: { reason: verify.reason, at: new Date().toISOString() } },
            updated_at: new Date().toISOString(),
          })
          .eq("id", prospect.id);
        return { ok: false as const, status: 422, error: verify.reason ?? "Email verification failed" };
      }

      const preferredWinner = await abWinnerFor(campaign);
      const { subject, variant } = pickSubjectVariant(
        prospect.email_subject,
        prospect.email_subject_b,
        preferredWinner,
      );
      const snapshotResolved = applySnapshotUrlToHtml(
        stripAiMetaFromHtml(prospect.email_body),
        prospect.raw,
        baseUrl,
      );
      if (snapshotResolved.error) {
        return {
          ok: false as const,
          status: 422,
          error: snapshotResolved.error,
        };
      }
      const validation = validateEmailForSend(subject, snapshotResolved.html, "initial");
      if (!validation.ok) {
        return {
          ok: false as const,
          status: 422,
          error: "Email failed validation before send.",
          issues: validation.issues,
        };
      }
      const trackedHtml = injectTracking(
        snapshotResolved.html,
        prospect.id,
        baseUrl,
      );

      let sendResult;
      try {
        outreachLog({
          level: "info",
          event: "send_attempt",
          prospectId: prospect.id,
          campaign,
          fromEmail: sendIdentity.fromEmail ?? "",
          fromName: sendIdentity.fromName ?? "",
        });
        sendResult = await sendOutreachEmail(
          campaign,
          prospect.email,
          validation.subject,
          trackedHtml,
          validation.plainBody,
          { prospectId: prospect.id, fromName: senderFromName },
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "SMTP error";
        outreachLog({
          level: "error",
          event: "send_failed",
          prospectId: prospect.id,
          campaign,
          error: msg,
        });
        if (msg.toLowerCase().includes("recipient") || msg.toLowerCase().includes("address")) {
          await sb
            .from("outreach_prospects")
            .update({ status: "bounced", updated_at: new Date().toISOString() })
            .eq("id", prospect.id);
        }
        return { ok: false as const, status: 502, error: `Send failed: ${msg}` };
      }

      const now = new Date();
      const nowIso = now.toISOString();
      const baseNextSend = nextFollowUpAt(nowIso, 0);
      const nextSendAt = baseNextSend
        ? await adjustSendTimeForSmartSend(sb, campaign, baseNextSend, String(prospect.country ?? "INT"))
        : null;
      const raw = (prospect.raw && typeof prospect.raw === "object" ? prospect.raw : {}) as Record<
        string,
        unknown
      >;

      await sb
        .from("outreach_prospects")
        .update({
          status: "sent",
          sent_at: nowIso,
          subject_variant: variant,
          next_send_at: nextSendAt,
          sequence_step: 0,
          followup_count: 0,
          engagement_tier: "cold",
          raw: {
            ...raw,
            last_send: {
              message_id: sendResult.messageId,
              provider: sendResult.provider,
              at: nowIso,
            },
          },
          updated_at: nowIso,
        })
        .eq("id", prospect.id);

      await sb.from("outreach_email_events").insert({
        prospect_id: prospect.id,
        campaign,
        event_type: "sent",
      });

      await insertOutreachMessage(sb, {
        prospectId: prospect.id,
        direction: "outbound",
        subject: validation.subject,
        bodyHtml: trackedHtml,
        bodyText: validation.plainBody,
        messageId: sendResult.messageId,
        occurredAt: nowIso,
      });

      await createLinkedInTaskIfNeeded(sb, prospect.id, campaign);

      invalidateOutreachStats(campaign);

      return { ok: true as const, campaign, variant };
    };

    if (!bulk) {
      const id = typeof body.id === "string" ? body.id : null;
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

      const { data: prospect, error } = await sb
        .from("outreach_prospects")
        .select("*")
        .eq("id", id)
        .single();

      if (error || !prospect) return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
      if (prospect.status !== "approved") {
        return NextResponse.json({ error: "Prospect must be approved before sending." }, { status: 400 });
      }
      if (!prospect.email || (!prospect.email_subject && !prospect.email_subject_b) || !prospect.email_body) {
        return NextResponse.json({ error: "Missing email address, subject, or body." }, { status: 400 });
      }

      const result = await sendOne(prospect);
      if (!result.ok) {
        const extra =
          result.status === 502 && result.error
            ? sendFailurePayload(result.error, {
                issues: "issues" in result ? result.issues : undefined,
              })
            : {
                error: result.error,
                issues: "issues" in result ? result.issues : undefined,
              };
        return NextResponse.json(extra, { status: result.status });
      }

      return NextResponse.json({
        ok: true,
        sent_to: prospect.email,
        campaign: result.campaign,
        subject_variant: result.variant,
      });
    }

    const campaign = normalizeCampaign(body.campaign);
    if (!isAllCampaigns(campaign)) {
      const check = isConfiguredForCampaign(campaign);
      if (!check.ok) {
        return NextResponse.json(
          { error: `Email sender is not configured for campaign '${campaign}'.`, hint: check.hint },
          { status: 400 },
        );
      }
    }

    const limit = getDailyLimit();
    let query = sb
      .from("outreach_prospects")
      .select("*")
      .eq("status", "approved")
      .order("lead_score", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(limit);

    if (!isAllCampaigns(campaign)) {
      query = query.eq("campaign", campaign);
    }

    const { data: prospects, error: listErr } = await query;

    if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });
    if (!prospects?.length) {
      return NextResponse.json({
        ok: true,
        sent: 0,
        campaign,
        message: isAllCampaigns(campaign)
          ? "No approved prospects to send across all campaigns."
          : "No approved prospects to send for this campaign.",
      });
    }

    let sent = 0;
    let failed = 0;
    let validationFailed = 0;
    let skippedUnconfigured = 0;
    let rateLimitSkipped = 0;
    const cappedCampaigns = new Set<string>();
    let firstError: string | null = null;
    let firstIssues: string[] | undefined;
    for (const prospect of prospects) {
      if (!prospect.email || (!prospect.email_subject && !prospect.email_subject_b) || !prospect.email_body)
        continue;

      const prospectCampaign = normalizeCampaign(prospect.campaign);
      if (isAllCampaigns(campaign) && cappedCampaigns.has(prospectCampaign)) {
        rateLimitSkipped++;
        continue;
      }

      const result = await sendOne(prospect);
      if (result.ok) {
        sent++;
        await sleep(sendJitterMs());
      } else {
        failed++;
        if ("skippedUnconfigured" in result && result.skippedUnconfigured) skippedUnconfigured++;
        if (result.status === 422 && !("skippedUnconfigured" in result && result.skippedUnconfigured)) {
          validationFailed++;
        }
        if (!firstError) {
          firstError = result.error;
          if ("issues" in result && Array.isArray(result.issues)) firstIssues = result.issues;
        }
        if (result.status === 429) {
          if (isAllCampaigns(campaign)) {
            cappedCampaigns.add(prospectCampaign);
          } else {
            break;
          }
        }
      }
    }

    if (sent === 0 && failed > 0) {
      const allValidation = validationFailed === failed;
      const allUnconfigured = skippedUnconfigured === failed;
      const errMsg = allUnconfigured
        ? `All ${failed} emails skipped — SMTP not configured for one or more campaigns`
        : allValidation
          ? `All ${failed} emails failed validation before send`
          : `All ${failed} sends failed`;
      const hint =
        !allValidation && !allUnconfigured && firstError ? smtpTroubleshootingHint(firstError) : undefined;
      return NextResponse.json(
        {
          ok: false,
          sent,
          failed,
          validationFailed,
          skippedUnconfigured,
          rateLimitSkipped,
          limit,
          campaign,
          error: errMsg,
          firstError,
          firstIssues,
          ...(hint ? { hint } : {}),
        },
        { status: allValidation ? 422 : allUnconfigured ? 400 : 502 },
      );
    }
    return NextResponse.json({
      ok: true,
      sent,
      failed,
      skippedUnconfigured,
      rateLimitSkipped,
      cappedCampaigns: cappedCampaigns.size ? Array.from(cappedCampaigns) : undefined,
      limit,
      campaign,
      firstError,
      firstIssues,
    });
  });
}
