import { NextResponse } from "next/server";
import { loadAbWinner } from "@/lib/outreach/ab-winner";
import { invalidateOutreachStats } from "@/lib/outreach/campaign-stats";
import {
  getDailyLimit,
  getEmailProvider,
  isConfiguredForCampaign,
  pickSubjectVariant,
} from "@/lib/outreach/campaign-env";
import { verifyOutreachEmail } from "@/lib/outreach/email-verify";
import { nextFollowUpAt } from "@/lib/outreach/followup-schedule";
import { outreachLog } from "@/lib/outreach/logger";
import { getPublicBaseUrl } from "@/lib/outreach/public-base-url";
import { canSendThisHour, sendJitterMs } from "@/lib/outreach/send-pacing";
import { stripAiMetaFromHtml } from "@/lib/outreach/email-validator";
import { validateEmailForSend } from "@/lib/outreach/send-validation";
import { sendOutreachEmail, verifySmtpForCampaign } from "@/lib/outreach/send-mail";
import { smtpTroubleshootingHint } from "@/lib/outreach/smtp-errors";
import { injectTracking } from "@/lib/outreach/tracking";
import { applySnapshotUrlToHtml } from "@/lib/outreach/snapshot-send";
import { withSupabaseRoute } from "@/lib/with-supabase-route";

function normalizeCampaign(raw: unknown): string {
  return typeof raw === "string" && raw.trim() ? raw.trim().toLowerCase() : "pesttrace";
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

  const payload: Record<string, unknown> = {
    campaign,
    provider: getEmailProvider(),
    configured: check.ok,
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
      raw?: Record<string, unknown> | null;
    }) => {
      const campaign = normalizeCampaign(prospect.campaign);

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
      const trackedHtml = injectTracking(
        snapshotResolved.html,
        prospect.id,
        baseUrl,
      );
      const validation = validateEmailForSend(subject, trackedHtml, "initial");
      if (!validation.ok) {
        return {
          ok: false as const,
          status: 422,
          error: "Email failed validation before send.",
          issues: validation.issues,
        };
      }

      let sendResult;
      try {
        sendResult = await sendOutreachEmail(
          campaign,
          prospect.email,
          validation.subject,
          trackedHtml,
          validation.plainBody,
          { prospectId: prospect.id },
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
      const nextSendAt = nextFollowUpAt(nowIso, 0);
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

      const campaign = normalizeCampaign(prospect.campaign);
      const check = isConfiguredForCampaign(campaign);
      if (!check.ok) {
        return NextResponse.json(
          { error: `Email sender is not configured for campaign '${campaign}'.`, hint: check.hint },
          { status: 400 },
        );
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
    const check = isConfiguredForCampaign(campaign);
    if (!check.ok) {
      return NextResponse.json(
        { error: `Email sender is not configured for campaign '${campaign}'.`, hint: check.hint },
        { status: 400 },
      );
    }

    const limit = getDailyLimit();
    const { data: prospects, error: listErr } = await sb
      .from("outreach_prospects")
      .select("*")
      .eq("status", "approved")
      .eq("campaign", campaign)
      .order("lead_score", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(limit);

    if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });
    if (!prospects?.length) {
      return NextResponse.json({
        ok: true,
        sent: 0,
        campaign,
        message: "No approved prospects to send for this campaign.",
      });
    }

    let sent = 0;
    let failed = 0;
    let validationFailed = 0;
    let firstError: string | null = null;
    let firstIssues: string[] | undefined;
    for (const prospect of prospects) {
      if (!prospect.email || (!prospect.email_subject && !prospect.email_subject_b) || !prospect.email_body)
        continue;
      const result = await sendOne(prospect);
      if (result.ok) {
        sent++;
        await sleep(sendJitterMs());
      } else {
        failed++;
        if (result.status === 422) validationFailed++;
        if (!firstError) {
          firstError = result.error;
          if ("issues" in result && Array.isArray(result.issues)) firstIssues = result.issues;
        }
        if (result.status === 429) break;
      }
    }

    if (sent === 0 && failed > 0) {
      const allValidation = validationFailed === failed;
      const errMsg = allValidation
        ? `All ${failed} emails failed validation before send`
        : `All ${failed} sends failed`;
      const hint =
        !allValidation && firstError ? smtpTroubleshootingHint(firstError) : undefined;
      return NextResponse.json(
        {
          ok: false,
          sent,
          failed,
          validationFailed,
          limit,
          campaign,
          error: errMsg,
          firstError,
          firstIssues,
          ...(hint ? { hint } : {}),
        },
        { status: allValidation ? 422 : 502 },
      );
    }
    return NextResponse.json({ ok: true, sent, failed, limit, campaign, firstError, firstIssues });
  });
}
