export type OutreachEmailBranding = {
  headerLabel: string;
  signature: string;
  ctaLabel: string;
  ctaUrl: string;
  accent: string;
  trustBadges: string[];
  optOut: string;
};

/** Branded HTML wrapper for outreach and follow-up emails. */
export function renderOutreachHtml(
  branding: OutreachEmailBranding,
  bodyText: string,
  prospectId: string,
): string {
  const paragraphs = bodyText
    .split("\n\n")
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 16px 0;font-size:15px;line-height:1.55;color:#1a1a1a;">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`,
    )
    .join("\n");

  const sigBlock = branding.signature
    .split("\n")
    .map((line) => `<div>${escapeHtml(line)}</div>`)
    .join("");

  const badges = branding.trustBadges
    .map((b) => `<span style="color:#4a5568;">${escapeHtml(b)}</span>`)
    .join(" &nbsp;·&nbsp; ");

  const ctaHref = appendProspectId(branding.ctaUrl, prospectId);

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f7f7f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,Helvetica,sans-serif;color:#1a1a1a;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f7f7f5;padding:24px 0;"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;background:#ffffff;border-radius:12px;border:1px solid #e5e5e5;overflow:hidden;">
<tr><td style="background:${branding.accent};padding:14px 24px;color:#ffffff;font-weight:600;font-size:14px;letter-spacing:0.3px;">${escapeHtml(branding.headerLabel)}</td></tr>
<tr><td style="padding:28px 28px 8px 28px;">${paragraphs}<div style="margin:16px 0;font-size:14px;color:#4a5568;">${sigBlock}</div></td></tr>
<tr><td align="center" style="padding:12px 24px 24px 24px;"><a data-outreach-cta="true" href="${escapeAttr(ctaHref)}" style="display:inline-block;background:${branding.accent};color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:15px;">${escapeHtml(branding.ctaLabel)}</a></td></tr>
<tr><td align="center" style="padding:0 24px 24px 24px;font-size:12px;color:#4a5568;">${badges}</td></tr>
<tr><td style="background:#fafafa;border-top:1px solid #eeeeee;padding:16px 24px;font-size:11px;line-height:1.5;color:#888888;">${escapeHtml(branding.optOut)}</td></tr>
</table>
<!-- OUTREACH_TRACKING_PIXEL -->
</td></tr></table>
</body></html>`;
}

function appendProspectId(url: string, prospectId: string): string {
  if (!prospectId) return url;
  const sep = url.includes("?") ? "&" : "?";
  if (url.includes("p=")) return url;
  return `${url}${sep}p=${encodeURIComponent(prospectId)}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

/** Default follow-up branding for legacy campaigns. */
export const LEGACY_FOLLOWUP_BRANDING: Record<
  "pesttrace" | "weathers",
  OutreachEmailBranding & { touchBodies: string[]; touchSubjects: string[] }
> = {
  pesttrace: {
    headerLabel: "The PestTrace Team",
    signature: "The PestTrace Team",
    ctaLabel: "See how PestTrace works",
    ctaUrl:
      "https://pesttrace.com/?utm_source=outreach&utm_medium=email&utm_campaign=pesttrace",
    accent: "#0F766E",
    trustBadges: ["Audit-ready records", "EU & global compliance", "7-day free trial"],
    optOut:
      "You're on this list because your business was found in a public directory. Reply STOP to be removed.",
    touchBodies: [
      "I wrote a few days ago — wanted to leave one more useful note in case it's relevant.\n\nMany pest control teams we talk to lose hours every week re-typing field paperwork before audits. PestTrace replaces that with a digital logbook your technicians fill in on the job — photos, signatures, follow-ups, expiry tracking, all audit-ready.\n\nIf that sounds familiar, the link below shows a short walkthrough.",
      "A pest control operator we work with cut audit prep from days to hours by moving treatment logs into one digital system — photos, signatures, and expiry tracking included.\n\nIf documentation pressure is building in your operation, the walkthrough below shows how teams like yours use PestTrace day to day.",
      "I'll leave it here — no more emails after this one.\n\nIf you ever want to make audit prep painless, PestTrace stays right there at pesttrace.com. Door's always open.",
    ],
    touchSubjects: [
      "Quick follow-up on audit-ready records",
      "How teams cut audit prep time",
      "Closing the loop — last note from PestTrace",
    ],
  },
  weathers: {
    headerLabel: "Weathers Pest Solutions",
    signature: "The Weathers Pest Solutions Team\n07462253896",
    ctaLabel: "Book a pest control slot",
    ctaUrl:
      "https://weatherspestsolutions.co.uk/book?utm_source=outreach&utm_medium=email&utm_campaign=weathers",
    accent: "#2F855A",
    trustBadges: ["BPCA Certified", "5-Star Rated", "24/7 Emergency", "£50 deposit off invoice"],
    optOut:
      "You're on this list because your business matched a sector that commonly requires pest control. Reply STOP to opt out.",
    touchBodies: [
      "Wanted to leave one more useful note in case it's helpful.\n\nWe cover the whole West Midlands — Birmingham, Wolverhampton, Coventry, Walsall, Dudley, Sandwell, Solihull, Stoke-on-Trent, Worcester — and the £50 deposit comes straight off the final invoice, so there are no hidden fees. Every booking carries a 100% Satisfaction Guarantee.\n\nIf any pest issues crop up, the booking link below lets you pick a slot in under a minute.",
      "A West Midlands site we support resolved a recurring pest issue with documented treatment, BPCA-certified technicians, and a clear guarantee — no hidden fees.\n\nIf prevention or a one-off visit would help your premises, the booking link below is the fastest way to secure a slot.",
      "I'll stop emailing after this — promise.\n\nIf pests crop up later, Weathers Pest Solutions is here 24/7 on 07462253896, with transparent pricing and a 100% Satisfaction Guarantee. The booking link below stays open.",
    ],
    touchSubjects: [
      "Quick follow-up about West Midlands pest cover",
      "Documented treatment that sticks",
      "Closing the loop — last note from Weathers",
    ],
  },
};
