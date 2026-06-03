import { OUTREACH_CONVERSION_DOCTRINE } from "@/lib/outreach/copy-doctrine";

/** Generate follow-up subject + plain body via Groq (same env as engine). */
export async function generateFollowUpCopy(params: {
  prompt: string;
  fallbackSubject: string;
  fallbackBody: string;
}): Promise<{ subject: string; body: string }> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  const model = process.env.GROQ_TEXT_MODEL?.trim() || "llama-3.1-8b-instant";

  const fullPrompt = `${OUTREACH_CONVERSION_DOCTRINE}\n\n${params.prompt}\n\nReturn JSON only: {"subject":"...","body":"..."}`;

  if (!apiKey) {
    return { subject: params.fallbackSubject, body: params.fallbackBody };
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
          {
            role: "system",
            content:
              "You write short B2B follow-up emails. Return valid JSON only with keys subject and body.",
          },
          { role: "user", content: fullPrompt },
        ],
      }),
    });

    if (!res.ok) {
      return { subject: params.fallbackSubject, body: params.fallbackBody };
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content?.trim() || "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { subject: params.fallbackSubject, body: params.fallbackBody };
    }

    const parsed = JSON.parse(jsonMatch[0]) as { subject?: string; body?: string };
    const subject = (parsed.subject || params.fallbackSubject).trim().slice(0, 120);
    const body = (parsed.body || params.fallbackBody).trim();
    if (!body) return { subject: params.fallbackSubject, body: params.fallbackBody };
    return { subject, body };
  } catch {
    return { subject: params.fallbackSubject, body: params.fallbackBody };
  }
}
