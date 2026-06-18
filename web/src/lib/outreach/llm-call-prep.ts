/** Groq-powered call prep scripts for inbound qualification (operator + public chat). */
import { OUTREACH_CONVERSION_DOCTRINE } from "@/lib/outreach/copy-doctrine";
import { sectorAngleForProspect, type BusinessOutreachSettings } from "@/lib/outreach/campaign-config";

export type CallPrepTrigger = "reply" | "click" | "call_intent" | "manual";

export type ObjectionHandling = { objection: string; response: string };

export type CallPrepScript = {
  opening_script: string;
  talking_points: string[];
  objection_handling: ObjectionHandling[];
  suggested_next_step: string;
};

export type ProspectCallContext = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  campaign: string;
  sector?: string | null;
  country?: string | null;
  city?: string | null;
  engagement_tier?: string | null;
  website_url?: string | null;
  raw?: { research?: Record<string, unknown> } | null;
  lastInboundText?: string | null;
};

const CAMPAIGN_GOALS: Record<string, string> = {
  weathers:
    "Qualify pest type, urgency, postcode/area, book vs emergency. CTA: booking page with £50 deposit off invoice.",
  pesttrace:
    "Confirm they are a pest control operator, team size, audit/documentation pain. CTA: pesttrace.com trial or demo.",
  jgdevs:
    "Website goal, timeline, current site pain. CTA: jgdev.co.uk snapshot or brief callback.",
};

const FALLBACK_SCRIPTS: Record<string, CallPrepScript> = {
  weathers: {
    opening_script:
      "Thanks for calling Weathers Pest Solutions — you may have had our email about pest cover for your premises. Are you calling about an active issue today, or planning ahead?",
    talking_points: [
      "Which pest type or area is the concern?",
      "Postcode or town so we can confirm coverage.",
      "Urgent today vs routine booking — we are BPCA certified and 24/7 for emergencies.",
      "£50 deposit secures a slot and comes off the final invoice.",
    ],
    objection_handling: [
      {
        objection: "Just getting prices",
        response:
          "Happy to outline — most visits start from our published rates once we know pest type and rooms affected. I can text the booking link so you see everything clearly.",
      },
      {
        objection: "Not ready yet",
        response:
          "No problem — I will note that down. If anything becomes urgent, we are on 07462253896 any time.",
      },
    ],
    suggested_next_step: "Send booking link or confirm emergency dispatch if urgent.",
  },
  pesttrace: {
    opening_script:
      "Thanks for calling PestTrace — you may have received our note about audit-ready records for pest control teams. Are you an operator looking at compliance software?",
    talking_points: [
      "Rough team size and how you handle treatment logs today.",
      "Whether audit or qualification expiry is the main pressure.",
      "PestTrace: digital logbook, photos, signatures, expiry tracking.",
      "7-day trial available at pesttrace.com.",
    ],
    objection_handling: [
      {
        objection: "We use paper / spreadsheets",
        response:
          "Many teams start there — the pain usually shows at audit time. A short walkthrough shows how field data becomes audit-ready automatically.",
      },
      {
        objection: "No budget now",
        response:
          "Understood — the trial lets you test with your team before any commitment.",
      },
    ],
    suggested_next_step: "Offer trial link or 10-minute demo.",
  },
  jgdevs: {
    opening_script:
      "Thanks for calling JGDevs — you may have had our email about your website. What would you most want the site to do for your business?",
    talking_points: [
      "Primary goal: more enquiries, bookings, or credibility.",
      "Timeline — any launch or busy season driving this?",
      "Mobile-friendly, clear contact path, fast load.",
      "We can send a short site snapshot or book a brief call.",
    ],
    objection_handling: [
      {
        objection: "Already have a site",
        response:
          "Most businesses do — we usually help when enquiries are lost on mobile or the site looks dated compared to competitors.",
      },
      {
        objection: "Too busy",
        response:
          "Fair — I can send a two-minute snapshot link you can review when it suits.",
      },
    ],
    suggested_next_step: "Send snapshot link or schedule a 10-minute callback.",
  },
};

function fallbackForCampaign(campaign: string): CallPrepScript {
  return FALLBACK_SCRIPTS[campaign] ?? FALLBACK_SCRIPTS.pesttrace;
}

function buildPrompt(
  prospect: ProspectCallContext,
  trigger: CallPrepTrigger,
  settings: BusinessOutreachSettings | null,
): string {
  const campaign = prospect.campaign || "pesttrace";
  const angle = sectorAngleForProspect(settings, prospect.sector ?? null);
  const goal = CAMPAIGN_GOALS[campaign] ?? CAMPAIGN_GOALS.pesttrace;
  const tier = prospect.engagement_tier || "cold";
  const inbound = prospect.lastInboundText?.trim().slice(0, 400) || "";

  return [
    OUTREACH_CONVERSION_DOCTRINE,
    "",
    `Campaign: ${campaign}`,
    `Qualification goal: ${goal}`,
    `Trigger: ${trigger} (prospect engaged after outreach email)`,
    `Engagement tier: ${tier}`,
    `Prospect: ${prospect.name}`,
    prospect.phone ? `Phone: ${prospect.phone}` : null,
    prospect.city || prospect.country ? `Location: ${[prospect.city, prospect.country].filter(Boolean).join(", ")}` : null,
    `Sector angle: ${angle}`,
    inbound ? `Last reply snippet: ${inbound}` : null,
    "",
    "Write a call prep script for the OPERATOR who will answer when this prospect calls back.",
    "Tone: calm, professional, UK English, problem→solution, never desperate.",
    "Keep opening_script under 60 words. 3-4 talking_points. 2 objection_handling pairs.",
    "",
    'Return JSON only: {"opening_script":"...","talking_points":["..."],"objection_handling":[{"objection":"...","response":"..."}],"suggested_next_step":"..."}',
  ]
    .filter(Boolean)
    .join("\n");
}

function parseCallPrepJson(raw: string, campaign: string): CallPrepScript | null {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]) as Partial<CallPrepScript>;
    const opening = (parsed.opening_script || "").trim();
    const points = Array.isArray(parsed.talking_points)
      ? parsed.talking_points.map(String).filter(Boolean).slice(0, 6)
      : [];
    const objections = Array.isArray(parsed.objection_handling)
      ? parsed.objection_handling
          .map((o) => {
            if (!o || typeof o !== "object") return null;
            const row = o as Record<string, unknown>;
            const objection = String(row.objection || "").trim();
            const response = String(row.response || "").trim();
            if (!objection || !response) return null;
            return { objection, response };
          })
          .filter(Boolean)
          .slice(0, 4) as ObjectionHandling[]
      : [];
    const next = (parsed.suggested_next_step || "").trim();
    if (!opening || !points.length) return null;
    return {
      opening_script: opening,
      talking_points: points,
      objection_handling: objections.length ? objections : fallbackForCampaign(campaign).objection_handling,
      suggested_next_step: next || fallbackForCampaign(campaign).suggested_next_step,
    };
  } catch {
    return null;
  }
}

/** Generate call prep script via Groq with campaign-aware fallbacks. */
export async function generateCallPrep(
  prospect: ProspectCallContext,
  trigger: CallPrepTrigger,
  settings: BusinessOutreachSettings | null = null,
): Promise<CallPrepScript> {
  const campaign = prospect.campaign || "pesttrace";
  const fallback = fallbackForCampaign(campaign);
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) return fallback;

  const prompt = buildPrompt(prospect, trigger, settings);
  const model = process.env.GROQ_TEXT_MODEL?.trim() || "llama-3.1-8b-instant";

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.35,
        max_tokens: 800,
        messages: [
          {
            role: "system",
            content:
              "You prepare concise inbound call scripts for sales operators. Return valid JSON only.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!res.ok) return fallback;

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content?.trim() || "";
    return parseCallPrepJson(raw, campaign) ?? fallback;
  } catch {
    return fallback;
  }
}

export type ChatTranscriptEntry = {
  role: "assistant" | "user";
  content: string;
  at: string;
};

export type QualifyChatResult = {
  reply: string;
  done: boolean;
  outcome?: "book" | "demo" | "callback" | "not_ready" | "unqualified";
};

const MAX_CHAT_TURNS = 5;

/** Multi-turn qualification chat for public /q/[token] page. */
export async function generateQualifyChatReply(params: {
  campaign: string;
  prospectName: string;
  bookingUrl: string;
  transcript: ChatTranscriptEntry[];
  userMessage: string;
}): Promise<QualifyChatResult> {
  const { campaign, prospectName, bookingUrl, transcript, userMessage } = params;
  const fallback = fallbackForCampaign(campaign);
  const turnCount = transcript.filter((t) => t.role === "user").length + 1;
  const done = turnCount >= MAX_CHAT_TURNS;

  const apiKey = process.env.GROQ_API_KEY?.trim();
  const systemPrompt = [
    `You are a professional qualification assistant for ${campaign}.`,
    CAMPAIGN_GOALS[campaign] ?? CAMPAIGN_GOALS.pesttrace,
    "Ask ONE short question at a time. UK English. Calm, not salesy.",
    `Prospect name: ${prospectName}`,
    `Booking URL (mention only when done): ${bookingUrl}`,
    done
      ? "This is the final turn — thank them, give one clear next step with the booking URL, and set outcome."
      : "Continue qualifying with one question.",
    'Return JSON: {"reply":"...","done":boolean,"outcome":"book"|"demo"|"callback"|"not_ready"|"unqualified"|null}',
  ].join("\n");

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemPrompt },
  ];
  for (const entry of transcript.slice(-8)) {
    messages.push({
      role: entry.role === "user" ? "user" : "assistant",
      content: entry.content,
    });
  }
  messages.push({ role: "user", content: userMessage });

  if (!apiKey) {
    if (done) {
      return {
        reply: `Thanks ${prospectName}. The fastest next step is here: ${bookingUrl}`,
        done: true,
        outcome: campaign === "pesttrace" ? "demo" : "book",
      };
    }
    return {
      reply: fallback.talking_points[Math.min(turnCount - 1, fallback.talking_points.length - 1)] ?? "What would be most helpful — a booking link or a quick callback?",
      done: false,
    };
  }

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.GROQ_TEXT_MODEL?.trim() || "llama-3.1-8b-instant",
        temperature: 0.4,
        max_tokens: 300,
        messages,
      }),
    });

    if (!res.ok) {
      return {
        reply: fallback.opening_script,
        done: false,
      };
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content?.trim() || "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as {
        reply?: string;
        done?: boolean;
        outcome?: string | null;
      };
      const reply = (parsed.reply || "").trim();
      const outcomes = new Set(["book", "demo", "callback", "not_ready", "unqualified"]);
      const outcome =
        parsed.outcome && outcomes.has(parsed.outcome)
          ? (parsed.outcome as QualifyChatResult["outcome"])
          : undefined;
      if (reply) {
        return {
          reply,
          done: Boolean(parsed.done) || done,
          outcome: parsed.done || done ? outcome ?? (campaign === "pesttrace" ? "demo" : "book") : undefined,
        };
      }
    }
  } catch {
    /* fall through */
  }

  return {
    reply: fallback.opening_script,
    done: false,
  };
}

export function formatCallScriptForCopy(script: CallPrepScript): string {
  const lines = [
    script.opening_script,
    "",
    "Talking points:",
    ...script.talking_points.map((p, i) => `${i + 1}. ${p}`),
    "",
    "Objections:",
    ...script.objection_handling.map((o) => `Q: ${o.objection}\nA: ${o.response}`),
    "",
    `Next step: ${script.suggested_next_step}`,
  ];
  return lines.join("\n");
}
