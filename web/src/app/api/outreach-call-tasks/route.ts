import { NextResponse } from "next/server";
import {
  createCallTaskIfNeeded,
  formatCallScriptForCopy,
  qualificationChatUrl,
} from "@/lib/outreach/call-tasks";
import { generateCallPrep } from "@/lib/outreach/llm-call-prep";
import { loadOutreachSettings } from "@/lib/outreach/campaign-config";
import { logTimelineEvent } from "@/lib/outreach/messages";
import { sendOutreachAlerts } from "@/lib/outreach/send-alert";
import { relatedRow } from "@/lib/supabase-relation";
import { withSupabaseRoute } from "@/lib/with-supabase-route";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "pending";
  const campaign = searchParams.get("campaign")?.trim().toLowerCase();

  return withSupabaseRoute(async (sb) => {
    const { data, error } = await sb
      .from("outreach_call_tasks")
      .select(
        "*, outreach_prospects(name, email, phone, campaign, engagement_tier, website_url)",
      )
      .eq("status", status)
      .order("due_at", { ascending: true })
      .limit(100);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = (data ?? []).filter((t) => {
      if (!campaign || campaign === "all") return true;
      const p = relatedRow(
        t.outreach_prospects as { campaign?: string } | { campaign?: string }[] | null,
      );
      return p?.campaign === campaign;
    });

    const withUrls = rows.map((row) => ({
      ...row,
      chat_url: qualificationChatUrl(row.qualification_token, req),
      script_copy: formatCallScriptForCopy({
        opening_script: row.opening_script,
        talking_points: Array.isArray(row.talking_points) ? row.talking_points : [],
        objection_handling: Array.isArray(row.objection_handling) ? row.objection_handling : [],
        suggested_next_step: row.suggested_next_step,
      }),
    }));

    return NextResponse.json(withUrls);
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const prospectId = String(body.prospect_id || body.prospectId || "").trim();
  if (!prospectId) {
    return NextResponse.json({ error: "prospect_id required" }, { status: 400 });
  }

  return withSupabaseRoute(async (sb) => {
    const { data: pending } = await sb
      .from("outreach_call_tasks")
      .select("id")
      .eq("prospect_id", prospectId)
      .eq("status", "pending")
      .maybeSingle();

    if (pending?.id) {
      await sb.from("outreach_call_tasks").update({ status: "skipped" }).eq("id", pending.id);
    }

    const row = await createCallTaskIfNeeded(sb, prospectId, "manual", { req, skipAlert: true });
    if (!row) {
      return NextResponse.json({ error: "Could not create task" }, { status: 500 });
    }

    const { data: prospect } = await sb
      .from("outreach_prospects")
      .select("*")
      .eq("id", prospectId)
      .maybeSingle();

    if (prospect && body.regenerate) {
      const campaign = String(prospect.campaign || "pesttrace");
      const settings = await loadOutreachSettings(sb, campaign);
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
        },
        "manual",
        settings,
      );

      const { data: updated } = await sb
        .from("outreach_call_tasks")
        .update({
          opening_script: script.opening_script,
          talking_points: script.talking_points,
          objection_handling: script.objection_handling,
          suggested_next_step: script.suggested_next_step,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .select("*")
        .single();

      return NextResponse.json({
        ...updated,
        chat_url: qualificationChatUrl(updated!.qualification_token, req),
      });
    }

    return NextResponse.json({
      ...row,
      chat_url: qualificationChatUrl(row.qualification_token, req),
    });
  });
}

export async function PATCH(req: Request) {
  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (body.status) updates.status = body.status;
  if (body.qualification_outcome !== undefined) {
    updates.qualification_outcome = body.qualification_outcome;
  }
  if (body.operator_notes !== undefined) {
    updates.operator_notes = body.operator_notes;
  }

  return withSupabaseRoute(async (sb) => {
    const { data: task } = await sb
      .from("outreach_call_tasks")
      .select("*, outreach_prospects(id, name, email, campaign, business_id)")
      .eq("id", body.id)
      .maybeSingle();

    if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { data, error } = await sb
      .from("outreach_call_tasks")
      .update(updates)
      .eq("id", body.id)
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const prospect = relatedRow(
      task.outreach_prospects as
        | {
            id: string;
            name?: string | null;
            email?: string | null;
            campaign?: string | null;
            business_id?: string | null;
          }
        | {
            id: string;
            name?: string | null;
            email?: string | null;
            campaign?: string | null;
            business_id?: string | null;
          }[]
        | null,
    );

    if (body.status === "done" && prospect) {
      await logTimelineEvent(sb, {
        prospectId: prospect.id,
        businessId: prospect.business_id,
        eventType: "call_completed",
        title: "Call qualification completed",
        detail: {
          outcome: body.qualification_outcome ?? null,
          notes: body.operator_notes ?? null,
        },
      });

      const outcome = String(body.qualification_outcome || "");
      if (outcome === "book" || outcome === "demo") {
        await sendOutreachAlerts(sb, "interested", {
          prospectId: prospect.id,
          campaign: prospect.campaign || "pesttrace",
          prospectName: prospect.name,
          prospectEmail: prospect.email,
          extra: `Call outcome: ${outcome}`,
        });
      }
    }

    return NextResponse.json(data);
  });
}

export const dynamic = "force-dynamic";
