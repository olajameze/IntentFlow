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
  jgdevs: {
    fromName: "JGDEVS_OUTREACH_FROM_NAME",
    fromEmail: "JGDEVS_OUTREACH_FROM_EMAIL",
    replyTo: "JGDEVS_REPLY_TO",
    smtpHost: "JGDEVS_SMTP_HOST",
    smtpUser: "JGDEVS_SMTP_USER",
    smtpPassword: "JGDEVS_SMTP_PASSWORD",
    smtpPort: "JGDEVS_SMTP_PORT",
    resendApiKey: "JGDEVS_RESEND_API_KEY",
    defaultFromName: "JGDevs",
  },
  breazy: {
    fromName: "BREAZY_OUTREACH_FROM_NAME",
    fromEmail: "BREAZY_OUTREACH_FROM_EMAIL",
    replyTo: "BREAZY_REPLY_TO",
    smtpHost: "BREAZY_SMTP_HOST",
    smtpUser: "BREAZY_SMTP_USER",
    smtpPassword: "BREAZY_SMTP_PASSWORD",
    smtpPort: "BREAZY_SMTP_PORT",
    resendApiKey: "BREAZY_RESEND_API_KEY",
    defaultFromName: "Breazy Productions",
  },
} as const;

export type LegacyCampaignId = keyof typeof CAMPAIGN_ENV;

/** Public sender addresses per brand — used when env vars are unset (e.g. Vercel missing JGDEVS_*). */
const CAMPAIGN_DEFAULT_FROM_EMAIL: Partial<Record<LegacyCampaignId, string>> = {
  weathers: "WeathersPestSolutions@hotmail.com",
  jgdevs: "hello@jgdev.co.uk",
  breazy: "breazyproductions7@gmail.com",
};

export type EmailProvider = "smtp" | "resend" | "auto";

function envVal(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v ? v : undefined;
}

/** Map campaign slug to env profile (unknown slugs use PestTrace defaults). */
export function resolveCampaignEnvKey(campaign: string): LegacyCampaignId {
  const slug = campaign.trim().toLowerCase();
  if (slug === "weathers") return "weathers";
  if (slug === "jgdevs") return "jgdevs";
  if (slug === "breazy") return "breazy";
  return "pesttrace";
}

export function getEmailProvider(): EmailProvider {
  const raw = process.env.OUTREACH_EMAIL_PROVIDER?.trim().toLowerCase();
  if (raw === "smtp" || raw === "resend" || raw === "auto") return raw;
  return "auto";
}

export function getBaseConfig(campaign: string, overrides?: { fromName?: string }) {
  const key = resolveCampaignEnvKey(campaign);
  const keys = CAMPAIGN_ENV[key];
  const isPesttrace = key === "pesttrace";
  const fromName =
    overrides?.fromName?.trim() ||
    envVal(keys.fromName) ||
    (isPesttrace ? envVal(CAMPAIGN_ENV.pesttrace.fromName) : undefined) ||
    keys.defaultFromName;
  // Never fall back to OUTREACH_FROM_EMAIL for non-pesttrace (that caused wrong sender bug).
  const fromEmail =
    envVal(keys.fromEmail) ||
    envVal(keys.smtpUser) ||
    CAMPAIGN_DEFAULT_FROM_EMAIL[key] ||
    (isPesttrace ? envVal(CAMPAIGN_ENV.pesttrace.fromEmail) ?? envVal("SMTP_USER") : undefined);
  const replyTo =
    envVal(keys.replyTo) || (isPesttrace ? envVal(CAMPAIGN_ENV.pesttrace.replyTo) : undefined);
  return { fromName, fromEmail, replyTo, envKey: key };
}

export function getSmtpConfig(campaign: string, overrides?: { fromName?: string }) {
  const key = resolveCampaignEnvKey(campaign);
  const keys = CAMPAIGN_ENV[key];
  // Campaign-specific SMTP first; shared Brevo relay (SMTP_*) is OK for all brands.
  const host = envVal(keys.smtpHost) || envVal("SMTP_HOST");
  const user = envVal(keys.smtpUser) || envVal("SMTP_USER");
  const password = envVal(keys.smtpPassword) || envVal("SMTP_PASSWORD");
  const portRaw = envVal(keys.smtpPort) || envVal("SMTP_PORT") || "587";
  const port = parseInt(portRaw, 10);
  const { fromName, fromEmail, replyTo } = getBaseConfig(campaign, overrides);
  return { host, user, password, port, fromName, fromEmail, replyTo, configured: !!(host && user && password) };
}

export function getResendConfig(campaign: string, overrides?: { fromName?: string }) {
  const key = resolveCampaignEnvKey(campaign);
  const keys = CAMPAIGN_ENV[key];
  const isPesttrace = key === "pesttrace";
  const apiKey = envVal(keys.resendApiKey) || (isPesttrace ? envVal("RESEND_API_KEY") : undefined);
  const { fromName, fromEmail, replyTo } = getBaseConfig(campaign, overrides);
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
  const base = getBaseConfig(campaign);
  const fromOk = key === "pesttrace" || Boolean(base.fromEmail?.trim());

  const transportOk =
    provider === "smtp"
      ? smtpCfg.configured
      : provider === "resend"
        ? resendCfg.configured
        : smtpCfg.configured || resendCfg.configured;

  const ok = transportOk && fromOk;

  if (ok) return { ok: true };

  const hintByKey: Partial<Record<LegacyCampaignId, string>> = {
    weathers: `Set ${keys.fromEmail} and ensure SMTP is configured (shared ${CAMPAIGN_ENV.pesttrace.smtpHost} or ${keys.smtpHost}).`,
    jgdevs: `Set ${keys.fromEmail} (e.g. hello@jgdev.co.uk) and ensure SMTP is configured — shared Brevo relay is fine; verify the From address in Brevo Senders.`,
    breazy: `Set ${keys.fromEmail} and ensure SMTP is configured (shared Brevo relay or ${keys.smtpHost}).`,
    pesttrace: `Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD (and OUTREACH_FROM_EMAIL) in web/.env.local or Vercel env.`,
  };
  return { ok: false, hint: hintByKey[key] ?? hintByKey.pesttrace };
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
