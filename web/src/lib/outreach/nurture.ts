import type { SupabaseClient } from "@supabase/supabase-js";

/** Enroll prospect in post-conversion nurture sequence. */
export async function enrollInNurture(
  sb: SupabaseClient,
  prospectId: string,
  campaign: string,
): Promise<void> {
  const { data: seq } = await sb
    .from("outreach_nurture_sequences")
    .select("step, offset_days")
    .eq("campaign", campaign)
    .eq("active", true)
    .order("step", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!seq) return;

  const sentAt = new Date();
  sentAt.setDate(sentAt.getDate() + (seq.offset_days ?? 7));

  await sb.from("outreach_nurture_enrollments").upsert(
    {
      prospect_id: prospectId,
      campaign,
      step: seq.step,
      next_send_at: sentAt.toISOString(),
      completed_at: null,
    },
    { onConflict: "prospect_id" },
  );
}

export function renderNurtureTemplate(
  template: string,
  vars: { name?: string | null; email?: string | null },
): string {
  return template
    .replace(/\{\{name\}\}/g, vars.name?.trim() || "there")
    .replace(/\{\{email\}\}/g, vars.email?.trim() || "");
}

/** Create LinkedIn connect task for B2B campaigns. */
export async function createLinkedInTaskIfNeeded(
  sb: SupabaseClient,
  prospectId: string,
  campaign: string,
): Promise<void> {
  if (campaign !== "pesttrace" && campaign !== "jgdevs") return;

  const due = new Date();
  due.setDate(due.getDate() + 2);

  const note =
    campaign === "pesttrace"
      ? "Hi — I sent a note about digital compliance for pest control teams. Worth a quick connect if useful."
      : "Hi — I reached out about your website and local visibility. Happy to connect if helpful.";

  const { data: existing } = await sb
    .from("outreach_linkedin_tasks")
    .select("id")
    .eq("prospect_id", prospectId)
    .eq("status", "pending")
    .maybeSingle();

  if (existing) return;

  await sb.from("outreach_linkedin_tasks").insert({
    prospect_id: prospectId,
    suggested_note: note,
    status: "pending",
    due_at: due.toISOString(),
  });
}
