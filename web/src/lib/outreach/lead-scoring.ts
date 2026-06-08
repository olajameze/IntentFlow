const PREFERRED_LOCAL = ["info@", "contact@", "hello@", "enquiries@", "office@"];

type Research = {
  services?: string[];
  has_https?: boolean;
  has_contact_page?: boolean;
  page_text_length?: number;
  page_text_sample?: string;
  sector?: string;
  contact_name?: string;
  phone?: string;
};

function contactQualityScore(email: string): number {
  const low = email.toLowerCase();
  if (PREFERRED_LOCAL.some((p) => low.startsWith(p))) return 15;
  if (low.includes("@")) return 8;
  return 0;
}

function websiteQualityScore(research: Research): number {
  let score = 0;
  if (research.has_https) score += 10;
  if (research.has_contact_page) score += 8;
  const len = research.page_text_length ?? 0;
  if (len > 1500) score += 7;
  else if (len > 400) score += 4;
  return Math.min(25, score);
}

function industryFitScore(sector: string, campaignId: string): number {
  const s = sector.toLowerCase();
  if (campaignId === "weathers") {
    const fit = new Set([
      "restaurant", "hotel", "care_home", "school", "letting_agent",
      "pub", "gym", "pet_groomer", "bakery", "food_production",
    ]);
    if (fit.has(s)) return 25;
    return s !== "generic" ? 12 : 8;
  }
  if (campaignId === "pesttrace") {
    return s === "pest_control_firm" || s === "generic" ? 25 : 15;
  }
  if (campaignId === "jgdevs") {
    const fit = new Set([
      "tradesperson", "salon", "local_shop", "professional",
      "restaurant", "gym", "pet_groomer", "pub", "bakery", "generic",
    ]);
    return fit.has(s) ? 25 : 12;
  }
  return 12;
}

function companySizeScore(research: Research, phone: string): number {
  let score = 0;
  if ((research.services?.length ?? 0) >= 2) score += 10;
  if (phone.trim()) score += 5;
  if ((research.page_text_length ?? 0) > 3000) score += 5;
  return Math.min(20, score);
}

function researchBoostScore(research: Research): number {
  let score = 0;
  if (String(research.contact_name || "").trim()) score += 10;
  if (String(research.phone || "").trim()) score += 5;
  const blob = (research.page_text_sample || "").toLowerCase();
  if (["compliance", "audit", "haccp", "food safety", "ipc"].some((k) => blob.includes(k))) {
    score += 10;
  }
  return Math.min(25, score);
}

function localMarketScore(country: string, city: string, campaignId: string): number {
  const c = country.toUpperCase();
  if (campaignId === "weathers") {
    return c === "UK" && city ? 15 : c === "UK" ? 10 : 0;
  }
  if (campaignId === "jgdevs") {
    const eu = new Set(["UK", "IE", "DE", "FR", "ES", "IT", "NL", "BE", "AT", "PT", "PL", "SE", "DK"]);
    return eu.has(c) && city ? 15 : eu.has(c) ? 10 : 0;
  }
  const target = new Set(["UK", "IE", "DE", "FR", "ES", "IT", "NL", "IN", "US", "CA", "AU"]);
  return target.has(c) ? 15 : 5;
}

export function computeLeadScore(prospect: {
  campaign?: string | null;
  sector?: string | null;
  email?: string | null;
  country?: string | null;
  city?: string | null;
  phone?: string | null;
  raw?: { research?: Research } | null;
}): { score: number; breakdown: Record<string, number> } {
  const research = prospect.raw?.research ?? {};
  const campaign = (prospect.campaign || "pesttrace").toLowerCase();
  const sector = (prospect.sector || research.sector || "generic").toString();

  const breakdown = {
    website_quality: websiteQualityScore(research),
    industry_fit: industryFitScore(sector, campaign),
    company_size: companySizeScore(research, prospect.phone || research.phone || ""),
    contact_quality: contactQualityScore(prospect.email || ""),
    local_market: localMarketScore(prospect.country || "", prospect.city || "", campaign),
    research_boost: researchBoostScore(research),
  };

  if (campaign === "jgdevs") {
    let opp = 0;
    if (!research.has_https) opp += 10;
    const len = research.page_text_length ?? 0;
    if (len < 500) opp += 12;
    if (!research.has_contact_page) opp += 8;
    const blob = (research.page_text_sample || "").toLowerCase();
    if (!["book", "booking", "appointment", "schedule"].some((k) => blob.includes(k))) opp += 5;
    breakdown.website_quality = Math.min(25, opp);
  }

  const score = Math.min(100, Object.values(breakdown).reduce((a, b) => a + b, 0));
  return { score, breakdown };
}
