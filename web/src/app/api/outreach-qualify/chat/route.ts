import { NextResponse } from "next/server";
import {
  generateQualifyChatReply,
  type ChatTranscriptEntry,
} from "@/lib/outreach/llm-call-prep";
import { logTimelineEvent } from "@/lib/outreach/messages";
import { sendOutreachAlerts } from "@/lib/outreach/send-alert";
import { withSupabaseRoute } from "@/lib/with-supabase-route";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** POST — public qualification chat turn. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const token = String(body.token || "").trim();
  const message = String(body.message || "").trim();

  if (!UUID_RE.test(token)) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }
  if (!message) {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }

  return withSupabaseRoute(async (sb) => {
    const { data: task } = await sb
      .from("outreach_call_tasks")
      .select(
        "id, booking_url, chat_transcript, qualification_outcome, outreach_prospects(id, name, email, campaign, business_id)",
      )
      .eq("qualification_token", token)
      .maybeSingle();

    if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (task.qualification_outcome) {
      return NextResponse.json({
        reply: "This session is complete. Use the booking link below if you have not already.",
        done: true,
        outcome: task.qualification_outcome,
        booking_url: task.booking_url,
      });
    }

    const prospect = task.outreach_prospects as {
      id: string;
      name?: string | null;
      email?: string | null;
      campaign?: string | null;
      business_id?: string | null;
    } | null;

    const campaign = prospect?.campaign || "pesttrace";
    const transcript = (Array.isArray(task.chat_transcript)
      ? task.chat_transcript
      : []) as ChatTranscriptEntry[];

    const now = new Date().toISOString();
    const userEntry: ChatTranscriptEntry = { role: "user", content: message, at: now };

    const result = await generateQualifyChatReply({
      campaign,
      prospectName: prospect?.name || "there",
      bookingUrl: task.booking_url,
      transcript,
      userMessage: message,
    });

    const assistantEntry: ChatTranscriptEntry = {
      role: "assistant",
      content: result.reply,
      at: new Date().toISOString(),
    };

    const newTranscript = [...transcript, userEntry, assistantEntry];

    const updates: Record<string, unknown> = {
      chat_transcript: newTranscript,
      updated_at: new Date().toISOString(),
    };

    if (result.done && result.outcome) {
      updates.qualification_outcome = result.outcome;
    }

    await sb.from("outreach_call_tasks").update(updates).eq("id", task.id);

    if (result.done && result.outcome && prospect) {
      await logTimelineEvent(sb, {
        prospectId: prospect.id,
        businessId: prospect.business_id,
        eventType: "qualification_chat_completed",
        title: "Prospect completed qualification chat",
        detail: { outcome: result.outcome },
      });

      if (result.outcome === "book" || result.outcome === "demo") {
        await sendOutreachAlerts(sb, "interested", {
          prospectId: prospect.id,
          campaign,
          prospectName: prospect.name,
          prospectEmail: prospect.email,
          extra: `Chat outcome: ${result.outcome}`,
        });
      }
    }

    return NextResponse.json({
      reply: result.reply,
      done: result.done,
      outcome: result.outcome ?? null,
      booking_url: result.done ? task.booking_url : null,
    });
  });
}

export const dynamic = "force-dynamic";
