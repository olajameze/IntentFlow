/** Per-campaign email sender env keys (PestTrace + Weathers + legacy slugs). */

export const CAMPAIGN_ENV = {
  pesttrace: {
    fromName: "OUTREACH_FROM_NAME",
    fromEmail: "OUTREACH_FROM_EMAIL",
    replyTo: "OUTREACH_REPLY_TO",
    smtpHost: "SMTP_HOST",
    smtpUser: "SMTP_USER",
    smtpPassword: "SMTP_PASSWORD",
    smtpPort: "SMTP_PORT",
    resendApiKey: "RESEND_API_KEY",
    defaultFromName: "PestTrace Team",
  },
  weathers: {
    fromName: "WEATHERS_OUTREACH_FROM_NAME",
    fromEmail: "WEATHERS_OUTREACH_FROM_EMAIL",
    replyTo: "WEATHERS_REPLY_TO",
    smtpHost: "WEATHERS_SMTP_HOST",
    smtpUser: "WEATHERS_SMTP_USER",
    smtpPassword: "WEATHERS_SMTP_PASSWORD",
    smtpPort: "WEATHERS_SMTP_PORT",
    resendApiKey: "WEATHERS_RESEND_API_KEY",
    defaultFromName: "Weathers Pest Solutions",
  },
} as const;

export type LegacyCampaignId = keyof typeof CAMPAIGN_ENV;

export type EmailProvider = "smtp" | "resend" | "auto";

function envVal(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v ? v : undefined;
}

/** Map any campaign slug to legacy env profile (custom slugs use PestTrace SMTP). */
export function resolveCampaignEnvKey(campaign: string): LegacyCampaignId {
  const slug = campaign.trim().toLowerCase();
  if (slug === "weathers") return "weathers";
  return "pesttrace";
}

export function getEmailProvider(): EmailProvider {
  const raw = process.env.OUTREACH_EMAIL_PROVIDER?.trim().toLowerCase();
  if (raw === "smtp" || raw === "resend" || raw === "auto") return raw;
  return "auto";
}

export function getBaseConfig(campaign: string) {
  const key = resolveCampaignEnvKey(campaign);
  const keys = CAMPAIGN_ENV[key];
  const fromName =
    envVal(keys.fromName) ?? envVal(CAMPAIGN_ENV.pesttrace.fromName) ?? keys.defaultFromName;
  const fromEmail =
    envVal(keys.fromEmail) ??
    envVal(CAMPAIGN_ENV.pesttrace.fromEmail) ??
    envVal(keys.smtpUser) ??
    envVal("SMTP_USER");
  const replyTo = envVal(keys.replyTo) ?? envVal(CAMPAIGN_ENV.pesttrace.replyTo);
  return { fromName, fromEmail, replyTo, envKey: key };
}

export function getSmtpConfig(campaign: string) {
  const key = resolveCampaignEnvKey(campaign);
  const keys = CAMPAIGN_ENV[key];
  const host = envVal(keys.smtpHost) ?? envVal("SMTP_HOST");
  const user = envVal(keys.smtpUser) ?? envVal("SMTP_USER");
  const password = envVal(keys.smtpPassword) ?? envVal("SMTP_PASSWORD");
  const portRaw = envVal(keys.smtpPort) ?? envVal("SMTP_PORT") ?? "587";
  const port = parseInt(portRaw, 10);
  const { fromName, fromEmail, replyTo } = getBaseConfig(campaign);
  return { host, user, password, port, fromName, fromEmail, replyTo, configured: !!(host && user && password) };
}

export function getResendConfig(campaign: string) {
  const key = resolveCampaignEnvKey(campaign);
  const keys = CAMPAIGN_ENV[key];
  const apiKey = envVal(keys.resendApiKey) ?? envVal("RESEND_API_KEY");
  const { fromName, fromEmail, replyTo } = getBaseConfig(campaign);
  return { apiKey, fromName, fromEmail, replyTo, configured: !!(apiKey && fromEmail) };
}

export function getDailyLimit(): number {
  const raw = process.env.OUTREACH_DAILY_SEND_LIMIT;
  const n = parseInt(raw ?? "20", 10);
  return Number.isFinite(n) && n > 0 ? n : 20;
}

export function isConfiguredForCampaign(campaign: string): { ok: boolean; hint?: string } {
  const provider = getEmailProvider();
  const smtpCfg = getSmtpConfig(campaign);
  const resendCfg = getResendConfig(campaign);
  const key = resolveCampaignEnvKey(campaign);
  const keys = CAMPAIGN_ENV[key];

  const ok =
    provider === "smtp"
      ? smtpCfg.configured
      : provider === "resend"
        ? resendCfg.configured
        : smtpCfg.configured || resendCfg.configured;

  if (ok) return { ok: true };

  const hint =
    key === "weathers"
      ? `Set WEATHERS SMTP credentials in web/.env.local: ${keys.smtpHost}, ${keys.smtpUser}, ${keys.smtpPassword}.`
      : `Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD (and OUTREACH_FROM_EMAIL) in web/.env.local.`;
  return { ok: false, hint };
}

/** Pick A/B subject; when `preferredWinner` is set, send winner ~80% (challenger 20%). */
export function pickSubjectVariant(
  a: string | null,
  b: string | null,
  preferredWinner?: "A" | "B" | null,
): { subject: string; variant: "A" | "B" } {
  const sA = (a || "").trim();
  const sB = (b || "").trim();
  if (sA && sB) {
    if (preferredWinner === "A" || preferredWinner === "B") {
      const pickWinner = Math.random() < 0.8;
      if (preferredWinner === "A") {
        return pickWinner ? { subject: sA, variant: "A" } : { subject: sB, variant: "B" };
      }
      return pickWinner ? { subject: sB, variant: "B" } : { subject: sA, variant: "A" };
    }
    const pickB = Math.random() < 0.5;
    return { subject: pickB ? sB : sA, variant: pickB ? "B" : "A" };
  }
  return { subject: sA || sB || "", variant: sB && !sA ? "B" : "A" };
}
