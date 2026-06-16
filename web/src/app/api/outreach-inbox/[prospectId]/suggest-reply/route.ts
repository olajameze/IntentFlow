import { NextResponse } from "next/server";
import { generateReplyDraft } from "@/lib/outreach/llm-reply";
import { withSupabaseRoute } from "@/lib/with-supabase-route";

type Params = { params: { prospectId: string } };

/** POST — LLM-suggested reply draft (human sends from inbox) */
export async function POST(_req: Request, { params }: Params) {
  const prospectId = params.prospectId?.trim();
  if (!prospectId) return NextResponse.json({ error: "prospectId required" }, { status: 400 });

  return withSupabaseRoute(async (sb) => {
    const { data: prospect } = await sb
      .from("outreach_prospects")
      .select("*")
      .eq("id", prospectId)
      .maybeSingle();
    if (!prospect) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { data: messages } = await sb
      .from("outreach_messages")
      .select("direction, body_text, subject, occurred_at")
      .eq("prospect_id", prospectId)
      .order("occurred_at", { ascending: true });

    const draft = await generateReplyDraft(prospect, messages ?? []);

    await sb.from("outreach_messages").insert({
      prospect_id: prospectId,
      direction: "draft",
      subject: draft.subject,
      body_text: draft.body,
      status: "draft",
    });

    return NextResponse.json(draft);
  });
}

export const dynamic = "force-dynamic";
