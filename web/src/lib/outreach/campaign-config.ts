import type { SupabaseClient } from "@supabase/supabase-js";
import {
  LEGACY_FOLLOWUP_BRANDING,
  type OutreachEmailBranding,
  renderOutreachHtml,
} from "@/lib/outreach/email-render";
import { localeRulesForCountry } from "@/lib/outreach/locale-rules";

export type BusinessOutreachSettings = {
  business_id: string;
  enabled: boolean;
  campaign_slug: string;
  sender_from_name: string | null;
  cta_url_template: string;
  cta_label: string;
  accent_color: string;
  trust_badges: string[] | unknown;
  follow_up_prompts: string[] | unknown;
  sector_angles: Record<string, string> | unknown;
};

export async function loadOutreachSettings(
  sb: SupabaseClient,
  campaignSlug: string,
): Promise<BusinessOutreachSettings | null> {
  const { data } = await sb
    .from("business_outreach_settings")
    .select("*")
    .eq("campaign_slug", campaignSlug)
    .maybeSingle();
  return data as BusinessOutreachSettings | null;
}

export function brandingFromSettings(
  settings: BusinessOutreachSettings | null,
  campaign: string,
): OutreachEmailBranding {
  if (settings) {
    const badges = Array.isArray(settings.trust_badges)
      ? (settings.trust_badges as string[])
      : [];
    return {
      headerLabel: settings.sender_from_name || settings.campaign_slug,
      signature: settings.sender_from_name || settings.campaign_slug,
      ctaLabel: settings.cta_label,
      ctaUrl: settings.cta_url_template.replace("{prospect_id}", ""),
      accent: settings.accent_color,
      trustBadges: badges.length ? badges : ["Trusted provider"],
      optOut: "Reply STOP to opt out of future emails.",
    };
  }

  const legacy = campaign === "weathers" ? LEGACY_FOLLOWUP_BRANDING.weathers : LEGACY_FOLLOWUP_BRANDING.pesttrace;
  return {
    headerLabel: legacy.headerLabel,
    signature: legacy.signature,
    ctaLabel: legacy.ctaLabel,
    ctaUrl: legacy.ctaUrl,
    accent: legacy.accent,
    trustBadges: legacy.trustBadges,
    optOut: legacy.optOut,
  };
}

export function sectorAngleForProspect(
  settings: BusinessOutreachSettings | null,
  sector: string | null,
): string {
  const key = (sector || "generic").toLowerCase();
  if (settings?.sector_angles && typeof settings.sector_angles === "object") {
    const angles = settings.sector_angles as Record<string, string>;
    return angles[key] || angles.generic || "general commercial concern";
  }
  return "general commercial concern";
}

export function buildFollowUpPrompt(
  settings: BusinessOutreachSettings | null,
  campaign: string,
  prospect: {
    name: string;
    website_url?: string | null;
    sector?: string | null;
    country?: string | null;
  },
  touchIndex: number,
  tier: string,
): { prompt: string; fallbackSubject: string; fallbackBody: string } {
  const country = (prospect.country || "INT").trim().toUpperCase() || "INT";
  const localeBlock = localeRulesForCountry(country);
  const legacy =
    campaign === "weathers" ? LEGACY_FOLLOWUP_BRANDING.weathers : LEGACY_FOLLOWUP_BRANDING.pesttrace;
  const angle = sectorAngleForProspect(settings, prospect.sector ?? null);
  const prompts = Array.isArray(settings?.follow_up_prompts)
    ? (settings.follow_up_prompts as string[])
    : [];
  const templatePrompt = prompts[touchIndex];

  const fallbackSubject = legacy.touchSubjects[touchIndex] ?? legacy.touchSubjects[0];
  const fallbackBody = legacy.touchBodies[touchIndex] ?? legacy.touchBodies[0];

  if (templatePrompt) {
    const prompt = `${localeBlock}\n\n${templatePrompt
      .replace(/\{name\}/g, prospect.name || "there")
      .replace(/\{website\}/g, prospect.website_url || "")
      .replace(/\{sector_angle\}/g, angle)
      .replace(/\{tier\}/g, tier)
      .replace(/\{country\}/g, country)}`;
    return { prompt, fallbackSubject, fallbackBody };
  }

  if (tier === "hot" && touchIndex === 0) {
    return {
      prompt: `${localeBlock}\n\nWrite a short follow-up (max 80 words) to ${prospect.name}. They clicked your booking/signup link but did not complete. Sector: ${angle}. Country: ${country}. Remind them the CTA button below is still open. One proof point. Sign off with team name only.`,
      fallbackSubject: "Still happy to help — quick note",
      fallbackBody:
        "I noticed you had a look at our booking page — wanted to check if a slot or quick call would help.\n\nThe button below is the fastest way to secure a time, and any deposit comes off the final invoice.\n\nNo pressure if timing isn't right.",
    };
  }

  return {
    prompt: `${localeBlock}\n\nWrite follow-up touch ${touchIndex + 1} for ${prospect.name} (${prospect.website_url || "no website"}). Sector angle: ${angle}. Country: ${country}. Tier: ${tier}. Max 90 words.`,
    fallbackSubject,
    fallbackBody,
  };
}

export function renderFollowUpHtmlForProspect(
  branding: OutreachEmailBranding,
  bodyText: string,
  prospectId: string,
  ctaUrlWithId?: string,
): string {
  const b = ctaUrlWithId
    ? { ...branding, ctaUrl: ctaUrlWithId }
    : branding;
  return renderOutreachHtml(b, bodyText, prospectId);
}
