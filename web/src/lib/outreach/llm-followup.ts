import { OUTREACH_CONVERSION_DOCTRINE } from "@/lib/outreach/copy-doctrine";
import { appendStrictInstruction } from "@/lib/outreach/generate-validated-copy";
import { generateValidatedCopy } from "@/lib/outreach/generate-validated-copy";

const OUTREACH_SYSTEM_PROMPT =
  "You are a professional B2B sales consultant writing short follow-up emails. Return valid JSON only with keys subject and body. No preamble or assistant phrases.";

async function callGroqForCopy(
  prompt: string,
  fallbackSubject: string,
  fallbackBody: string,
): Promise<{ subject: string; body: string }> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  const model = process.env.GROQ_TEXT_MODEL?.trim() || "llama-3.1-8b-instant";

  const fullPrompt = `${OUTREACH_CONVERSION_DOCTRINE}\n\n${prompt}\n\nReturn JSON only: {"subject":"...","body":"..."}`;

  if (!apiKey) {
    return { subject: fallbackSubject, body: fallbackBody };
  }

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        max_tokens: 600,
        messages: [
          { role: "system", content: OUTREACH_SYSTEM_PROMPT },
          { role: "user", content: fullPrompt },
        ],
      }),
    });

    if (!res.ok) {
      return { subject: fallbackSubject, body: fallbackBody };
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content?.trim() || "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { subject: fallbackSubject, body: fallbackBody };
    }

    const parsed = JSON.parse(jsonMatch[0]) as { subject?: string; body?: string };
    const subject = (parsed.subject || fallbackSubject).trim().slice(0, 120);
    const body = (parsed.body || fallbackBody).trim();
    if (!body) return { subject: fallbackSubject, body: fallbackBody };
    return { subject, body };
  } catch {
    return { subject: fallbackSubject, body: fallbackBody };
  }
}

/** Generate follow-up subject + plain body via Groq with validation and auto-regeneration. */
export async function generateFollowUpCopy(params: {
  prompt: string;
  fallbackSubject: string;
  fallbackBody: string;
  prospectId?: string;
  campaign?: string;
}): Promise<{ subject: string; body: string }> {
  const result = await generateValidatedCopy(
    async (_attempt, strict) => {
      const prompt = appendStrictInstruction(params.prompt, strict);
      return callGroqForCopy(prompt, params.fallbackSubject, params.fallbackBody);
    },
    {
      kind: "followup",
      fallbackSubject: params.fallbackSubject,
      fallbackBody: params.fallbackBody,
      prospectId: params.prospectId,
      campaign: params.campaign,
    },
  );

  return { subject: result.subject, body: result.body };
}
