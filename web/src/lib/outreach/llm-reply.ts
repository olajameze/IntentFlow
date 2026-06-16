/** Reply-aware LLM draft for inbox operator review. */
import { generateFollowUpCopy } from "@/lib/outreach/llm-followup";

type MessageRow = {
  direction: string;
  body_text?: string | null;
  subject?: string | null;
};

type ProspectRow = Record<string, unknown> & {
  name?: string | null;
  email?: string | null;
  campaign?: string | null;
  email_subject?: string | null;
};

export async function generateReplyDraft(
  prospect: ProspectRow,
  messages: MessageRow[],
): Promise<{ subject: string; body: string }> {
  const inbound = [...messages].reverse().find((m) => m.direction === "inbound");
  const inboundText = inbound?.body_text?.trim() || "Thanks for your email.";
  const campaign = String(prospect.campaign || "pesttrace");

  const prompt = [
    `Prospect ${prospect.name || prospect.email} replied:`,
    inboundText,
    "",
    "Write a short, professional reply (under 120 words). UK English. No desperation.",
    "Reference their specific question or concern. One clear next step.",
  ].join("\n");

  const base = await generateFollowUpCopy({
    prompt,
    fallbackSubject: `Re: ${inbound?.subject || prospect.email_subject || "your enquiry"}`,
    fallbackBody: `Hi ${prospect.name || "there"},\n\nThank you for your reply. I would be glad to help — shall we arrange a brief call this week?\n\nBest regards`,
    prospectId: String(prospect.id || ""),
    campaign,
  });

  const subject =
    base.subject.startsWith("Re:") ? base.subject : `Re: ${inbound?.subject || prospect.email_subject || "your enquiry"}`;

  return { subject, body: base.body };
}
