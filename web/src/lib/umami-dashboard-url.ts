/** Build Umami Cloud dashboard links (no API key required — opens the live UI). */

export function umamiCloudRegion(): "eu" | "us" | null {
  const raw = (process.env.NEXT_PUBLIC_UMAMI_CLOUD_REGION || process.env.UMAMI_CLOUD_REGION || "eu")
    .trim()
    .toLowerCase();
  if (raw === "eu" || raw === "us") return raw;
  return null;
}

export function umamiCloudPortfolioUrl(): string {
  const region = umamiCloudRegion();
  if (region) return `https://cloud.umami.is/analytics/${region}/dashboard`;
  return "https://cloud.umami.is/dashboard";
}

export function umamiCloudWebsiteUrl(websiteId: string): string | null {
  const id = websiteId.trim();
  if (!id) return null;
  const region = umamiCloudRegion();
  if (region) return `https://cloud.umami.is/analytics/${region}/websites/${id}`;
  return `https://cloud.umami.is/websites/${id}`;
}
