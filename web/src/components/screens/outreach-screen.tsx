"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, CheckCircle2, ChevronDown, ChevronUp, Copy, Eye, Flame, Globe, Loader2, Mail, MailOpen, MousePointerClick, Reply, Send, Sparkles, Trash2, X } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Client-side Actions URL when `NEXT_PUBLIC_GITHUB_REPO` is set (token may still be missing). */
function githubOutreachWorkflowUrl(): string | null {
  const slug = process.env.NEXT_PUBLIC_GITHUB_REPO?.trim();
  if (!slug?.includes("/")) return null;
  return `https://github.com/${slug}/actions/workflows/outreach-engine.yml`;
}

/** Full-screen email preview modal — renders HTML in a sandboxed iframe. */
function EmailPreviewModal({
  subject,
  html,
  recipientEmail,
  fromLabel,
  onClose,
}: {
  subject: string;
  html: string;
  recipientEmail: string;
  fromLabel: string;
  onClose: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Write HTML into the iframe after mount
  useEffect(() => {
    const doc = iframeRef.current?.contentDocument;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
    }
  }, [html]);

  // Close on Escape key; lock body scroll while open
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur"
      role="dialog"
      aria-modal="true"
      aria-label="Email preview"
    >
      {/* Header bar */}
      <div className="flex items-center justify-between border-b bg-card px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">Preview — as seen in recipient inbox</p>
          <p className="truncate text-sm font-semibold">{subject}</p>
          <p className="text-[11px] text-muted-foreground">To: {recipientEmail}</p>
        </div>
        <Button type="button" variant="ghost" size="icon" className="ml-2 shrink-0" onClick={onClose} aria-label="Close preview">
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Simulated inbox context */}
      <div className="flex-1 overflow-auto bg-gray-50 dark:bg-zinc-900 p-2 sm:p-6">
        <div className="mx-auto max-w-xl rounded-xl border bg-white shadow-sm">
          {/* Faux inbox meta */}
          <div className="border-b px-5 py-4">
            <p className="text-xs font-semibold text-gray-700">{fromLabel}</p>
            <p className="text-xs text-gray-500">To: {recipientEmail}</p>
            <p className="mt-1 text-[11px] font-semibold text-gray-800">{subject}</p>
          </div>
          {/* Rendered email body */}
          <iframe
            ref={iframeRef}
            title="Email preview"
            sandbox="allow-same-origin"
            className="h-[60vh] w-full rounded-b-xl border-0"
          />
        </div>
      </div>
    </div>
  );
}

type Prospect = Record<string, unknown>;
type Campaign = "pesttrace" | "weathers";

type CampaignStats = {
  campaign: Campaign;
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  booked: number;
  delivered?: number;
  interested?: number;
  meeting_booked?: number;
  converted?: number;
  bounced: number;
  hot_leads?: number;
  revenue_attributed?: number;
  engagement?: { hot: number; warm: number; cold: number };
  open_rate: number;
  click_rate: number;
  reply_rate: number;
  booking_rate: number;
  bounce_rate: number;
  ab_test: {
    variant_a_sent: number;
    variant_a_replies: number;
    variant_a_reply_rate: number;
    variant_b_sent: number;
    variant_b_replies: number;
    variant_b_reply_rate: number;
  };
};

function pct(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0%";
  return `${(n * 100).toFixed(n >= 0.1 ? 0 : 1)}%`;
}

/** Klaviyo step 9 — conversion funnel KPI strip. Sent → Open → Click → Reply → Booked. */
function StatsPanel({ stats }: { stats: CampaignStats | null }) {
  if (!stats) {
    return (
      <div className="rounded-lg border bg-card p-3 text-xs text-muted-foreground">
        Loading conversion metrics…
      </div>
    );
  }

  const tiles: Array<{
    label: string;
    value: string;
    sub: string;
    icon: React.ReactNode;
    accent: string;
  }> = [
    {
      label: "Sent",
      value: String(stats.sent),
      sub:
        stats.delivered != null
          ? `${stats.delivered} delivered${stats.bounced > 0 ? ` · ${stats.bounced} bounced` : ""}`
          : stats.bounced > 0
            ? `${stats.bounced} bounced`
            : "in flight",
      icon: <Send className="h-3.5 w-3.5" />,
      accent: "text-foreground",
    },
    {
      label: "Open rate",
      value: pct(stats.open_rate),
      sub: `${stats.opened} opens`,
      icon: <MailOpen className="h-3.5 w-3.5" />,
      accent: "text-sky-500",
    },
    {
      label: "Click rate",
      value: pct(stats.click_rate),
      sub: `${stats.clicked} clicks`,
      icon: <MousePointerClick className="h-3.5 w-3.5" />,
      accent: "text-amber-500",
    },
    {
      label: "Reply rate",
      value: pct(stats.reply_rate),
      sub: `${stats.replied} replies`,
      icon: <Reply className="h-3.5 w-3.5" />,
      accent: "text-violet-400",
    },
    {
      label: "Booked",
      value: pct(stats.booking_rate),
      sub: `${stats.booked} customers`,
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      accent: "text-emerald-500",
    },
    {
      label: "Hot leads",
      value: String(stats.hot_leads ?? 0),
      sub: `${stats.revenue_attributed ?? 0} paid via webhook`,
      icon: <Flame className="h-3.5 w-3.5" />,
      accent: "text-orange-500",
    },
  ];

  const ab = stats.ab_test;
  const aMin = 5;  // minimum sample size before declaring a winner
  let abVerdict: string | null = null;
  if (ab.variant_a_sent >= aMin && ab.variant_b_sent >= aMin) {
    const aR = ab.variant_a_reply_rate;
    const bR = ab.variant_b_reply_rate;
    if (Math.abs(aR - bR) < 0.01) abVerdict = "Tie — keep testing";
    else if (aR > bR) abVerdict = `Subject A winning (+${pct(aR - bR)})`;
    else abVerdict = `Subject B winning (+${pct(bR - aR)})`;
  } else if (ab.variant_a_sent + ab.variant_b_sent > 0) {
    abVerdict = `A: ${ab.variant_a_sent} · B: ${ab.variant_b_sent} — need ${aMin} each`;
  }

  const funnelTiles: Array<{ label: string; value: string }> = [
    { label: "Interested", value: String(stats.interested ?? 0) },
    { label: "Meeting booked", value: String(stats.meeting_booked ?? 0) },
    { label: "Converted", value: String(stats.converted ?? 0) },
  ];

  return (
    <div className="space-y-2 rounded-lg border bg-card p-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-md border bg-background/50 p-2">
            <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              <span className={t.accent}>{t.icon}</span>
              {t.label}
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{t.value}</p>
            <p className="text-[11px] text-muted-foreground">{t.sub}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {funnelTiles.map((t) => (
          <div key={t.label} className="rounded-md border bg-background/30 px-2 py-1.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t.label}</p>
            <p className="text-sm font-semibold tabular-nums">{t.value}</p>
          </div>
        ))}
      </div>
      {abVerdict && (
        <p className="text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">Subject A/B:</span> {abVerdict}
        </p>
      )}
    </div>
  );
}

const COUNTRY_LABELS: Record<string, string> = {
  DE: "Germany",
  FR: "France",
  ES: "Spain",
  IT: "Italy",
  NL: "Netherlands",
  IN: "India",
  IE: "Ireland",
  UK: "UK",
  US: "USA",
  CA: "Canada",
  AU: "Australia",
  INT: "International",
};
const PREVIEW_LEN = 140;

const CAMPAIGN_META: Record<
  Campaign,
  {
    label: string;
    short: string;
    blurb: string;
    fromEmail: string;
    countries: string;
  }
> = {
  pesttrace: {
    label: "PestTrace",
    short: "PestTrace",
    blurb: "Compliance SaaS for pest control businesses across Europe, India, and the Americas.",
    fromEmail: "pesttrace@gmail.com",
    countries: "EU · IN · UK · US · CA · AU",
  },
  weathers: {
    label: "Weathers Pest Solutions",
    short: "Weathers",
    blurb: "West Midlands pest control services to UK commercial premises (restaurants, hotels, care homes, letting agents, food sites).",
    fromEmail: "WeathersPestSolutions@hotmail.com",
    countries: "UK only (West Midlands)",
  },
};

function countryBadgeClass(country: string) {
  if (country === "UK" || country === "IE") return "bg-blue-600/15 text-blue-400 border-blue-600/30";
  if (country === "US") return "bg-red-600/15 text-red-400 border-red-600/30";
  if (country === "CA") return "bg-orange-600/15 text-orange-400 border-orange-600/30";
  if (country === "AU") return "bg-emerald-600/15 text-emerald-400 border-emerald-600/30";
  if (country === "IN") return "bg-amber-600/15 text-amber-400 border-amber-600/30";
  if (["DE", "FR", "ES", "IT", "NL"].includes(country)) {
    return "bg-violet-600/15 text-violet-400 border-violet-600/30";
  }
  return "";
}

function ProspectCard({
  prospect,
  mode,
  onRefresh,
}: {
  prospect: Prospect;
  mode: "review" | "approved" | "sent" | "rejected";
  onRefresh: () => Promise<void>;
}) {
  const id = String(prospect.id);
  const name = String(prospect.name ?? "Unknown");
  const email = String(prospect.email ?? "");
  const country = String(prospect.country ?? "");
  const city = String(prospect.city ?? "");
  const website = String(prospect.website_url ?? "");
  const sentAt = prospect.sent_at as string | null | undefined;
  const sector = (prospect.sector as string | null | undefined) || "";
  const openedAt = prospect.opened_at as string | null | undefined;
  const clickedAt = prospect.clicked_at as string | null | undefined;
  const repliedAt = prospect.replied_at as string | null | undefined;
  const bookedAt = prospect.booked_at as string | null | undefined;
  const engagementTier = (prospect.engagement_tier as string | null | undefined) || "cold";
  const clickCount = Number(prospect.click_count ?? 0);
  const subjectVariant = (prospect.subject_variant as string | null | undefined) || "";
  const subjectB = String(prospect.email_subject_b ?? "");
  const leadScore = Number(prospect.lead_score ?? 0);
  const followupCount = Number(prospect.followup_count ?? 0);
  const sequenceStep = Number(prospect.sequence_step ?? followupCount);
  const nextSendAt = prospect.next_send_at as string | null | undefined;
  const raw = (prospect.raw && typeof prospect.raw === "object" ? prospect.raw : {}) as Record<string, unknown>;
  const research = (raw.research && typeof raw.research === "object" ? raw.research : {}) as Record<string, unknown>;
  const verify = (raw.verify && typeof raw.verify === "object" ? raw.verify : null) as { ok?: boolean; reason?: string } | null;
  const servicesSnippet = Array.isArray(research.services)
    ? (research.services as string[]).slice(0, 2).join(", ")
    : "";
  const weaknessSnippet = Array.isArray(research.weaknesses)
    ? String((research.weaknesses as string[])[0] || "")
    : "";
  const campaign: Campaign = prospect.campaign === "weathers" ? "weathers" : "pesttrace";
  const fromLabel = `${CAMPAIGN_META[campaign].label} <${CAMPAIGN_META[campaign].fromEmail}>`;

  const [subject, setSubject] = useState(String(prospect.email_subject ?? ""));
  const [previewVariantB, setPreviewVariantB] = useState(false);
  const [body, setBody] = useState(String(prospect.email_body ?? ""));
  const [expanded, setExpanded] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const bodyText = body.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim();
  const preview = bodyText.length > PREVIEW_LEN ? bodyText.slice(0, PREVIEW_LEN).trimEnd() + "…" : bodyText;

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${bodyText}`);
      setCopied(true);
      toast.success("Email copied to clipboard");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Copy failed — select text manually");
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/outreach-prospects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, email_subject: subject.trim(), email_body: body.trim() }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as Record<string, unknown>;
        toast.error(typeof d.error === "string" ? d.error : "Could not save edits");
        return;
      }
      toast.success("Saved");
      await onRefresh();
    } finally { setSaving(false); }
  };

  const setStatus = async (status: string) => {
    const res = await fetch("/api/outreach-prospects", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (!res.ok) {
      toast.error("Could not update status");
      return;
    }
    toast.success(status === "approved" ? "Approved — move to Approved tab to send." : "Rejected");
    await onRefresh();
  };

  const markFlag = async (flag: "replied" | "booked", value: boolean) => {
    const res = await fetch("/api/outreach-prospects", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, [flag]: value }),
    });
    if (!res.ok) {
      toast.error(`Could not mark ${flag}`);
      return;
    }
    toast.success(
      value ? `Marked as ${flag === "booked" ? "paying customer" : "replied"}` : `Cleared ${flag} flag`,
    );
    await onRefresh();
  };

  const sendNow = async () => {
    setSending(true);
    try {
      const res = await fetch("/api/outreach-prospects/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json().catch(() => ({})) as Record<string, unknown>;
      if (!res.ok) {
        const hint = typeof data.hint === "string" ? `\n${data.hint}` : "";
        toast.error(`${typeof data.error === "string" ? data.error : "Send failed"}${hint}`, { duration: 12000 });
        return;
      }
      toast.success(`Email sent to ${email}`);
      await onRefresh();
    } finally { setSending(false); }
  };

  const deleteProspect = async () => {
    if (!window.confirm("Delete this prospect? This cannot be undone.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/outreach-prospects?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Could not delete");
        return;
      }
      toast.success("Deleted");
      await onRefresh();
    } finally { setDeleting(false); }
  };

  return (
    <>
      {previewing && body && (
        <EmailPreviewModal
          subject={previewVariantB && subjectB ? subjectB : subject}
          html={body}
          recipientEmail={email}
          fromLabel={fromLabel}
          onClose={() => {
            setPreviewing(false);
            setPreviewVariantB(false);
          }}
        />
      )}

      <Card className="border border-border/80 shadow-sm">
        <CardHeader className="pb-2">
          {/* ── Top row: meta on left, icon buttons on right ── */}
          <div className="flex min-w-0 items-start justify-between gap-2">
            {/* Left: name, email, subject — shrinks, never overflows */}
            <div className="min-w-0 flex-1 overflow-hidden">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="truncate text-sm font-semibold">{name}</span>
                <Badge variant="outline" className={`shrink-0 text-[10px] ${countryBadgeClass(country)}`}>
                  {COUNTRY_LABELS[country] ?? country}
                </Badge>
                <Badge
                  variant="outline"
                  className={`shrink-0 text-[10px] ${
                    campaign === "weathers"
                      ? "border-amber-600/30 bg-amber-600/15 text-amber-400"
                      : "border-primary/30 bg-primary/10 text-primary"
                  }`}
                  title={`Campaign: ${CAMPAIGN_META[campaign].label}`}
                >
                  {CAMPAIGN_META[campaign].short}
                </Badge>
                {sector && (
                  <Badge variant="outline" className="shrink-0 text-[10px] capitalize" title="Detected sector">
                    {sector.replace(/_/g, " ")}
                  </Badge>
                )}
                {leadScore > 0 && (
                  <Badge
                    variant="outline"
                    className="shrink-0 text-[10px] border-emerald-600/30 bg-emerald-600/10 text-emerald-400"
                    title="Lead score (0–100)"
                  >
                    Score {leadScore}
                  </Badge>
                )}
                {mode === "sent" && engagementTier === "hot" && !bookedAt && (
                  <Badge className="shrink-0 border-orange-600/30 bg-orange-600/15 text-[10px] text-orange-400">
                    <Flame className="mr-0.5 h-3 w-3" />
                    Hot{clickCount > 0 ? ` · ${clickCount} click${clickCount === 1 ? "" : "s"}` : ""}
                  </Badge>
                )}
                {city && <span className="shrink-0 text-[11px] text-muted-foreground">{city}</span>}
              </div>
              {(servicesSnippet || weaknessSnippet) && (
                <p className="mt-1 truncate text-[10px] text-muted-foreground" title="Research summary">
                  {servicesSnippet}
                  {servicesSnippet && weaknessSnippet ? " · " : ""}
                  {weaknessSnippet}
                </p>
              )}
              {mode === "sent" && !repliedAt && !bookedAt && sentAt && followupCount < 3 && (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Touch {sequenceStep + 1}/4
                  {nextSendAt
                    ? ` · due ${new Date(nextSendAt).toLocaleDateString()}`
                    : followupCount >= 3
                      ? " · sequence complete"
                      : ""}
                </p>
              )}
              {verify && verify.ok === false && (
                <p className="mt-1 text-[10px] text-amber-500">
                  Verification: {verify.reason || "failed — fix before send"}
                </p>
              )}
              {mode === "sent" && (openedAt || clickedAt || repliedAt || bookedAt || subjectVariant) && (
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                  {subjectVariant && (
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono">Subj {subjectVariant}</span>
                  )}
                  {openedAt && (
                    <span className="flex items-center gap-0.5 text-sky-400" title={`Opened ${new Date(openedAt).toLocaleString()}`}>
                      <MailOpen className="h-3 w-3" /> opened
                    </span>
                  )}
                  {clickedAt && (
                    <span className="flex items-center gap-0.5 text-amber-400" title={`Clicked CTA ${new Date(clickedAt).toLocaleString()}`}>
                      <MousePointerClick className="h-3 w-3" /> clicked
                    </span>
                  )}
                  {repliedAt && (
                    <span className="flex items-center gap-0.5 text-violet-400" title={`Replied ${new Date(repliedAt).toLocaleString()}`}>
                      <Reply className="h-3 w-3" /> replied
                    </span>
                  )}
                  {bookedAt && (
                    <span className="flex items-center gap-0.5 text-emerald-400" title={`Booked ${new Date(bookedAt).toLocaleString()}`}>
                      <CheckCircle2 className="h-3 w-3" /> booked
                    </span>
                  )}
                </div>
              )}
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span className="flex min-w-0 items-center gap-0.5 truncate">
                  <Mail className="h-3 w-3 shrink-0" />
                  <span className="truncate">{email}</span>
                </span>
                {website && (
                  <a
                    href={website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex shrink-0 items-center gap-0.5 hover:text-foreground hover:underline"
                  >
                    <Globe className="h-3 w-3" />website
                  </a>
                )}
                {sentAt && <span className="shrink-0">Sent {new Date(sentAt).toLocaleDateString()}</span>}
              </div>
              {subject && (
                <p className="mt-1 truncate text-[11px] font-medium italic text-foreground/80">
                  &ldquo;{subject}&rdquo;
                  {subjectB && mode !== "sent" && (
                    <span className="ml-1 not-italic text-muted-foreground">/ B: {subjectB.slice(0, 60)}{subjectB.length > 60 ? "…" : ""}</span>
                  )}
                </p>
              )}
            </div>

            {/* Right: icon buttons — fixed width, never wrap */}
            <div className="flex shrink-0 items-center">
              {body && subjectB && mode !== "sent" && (
                <Button
                  type="button" variant="ghost" size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setPreviewVariantB(true);
                    setPreviewing(true);
                  }}
                  aria-label="Preview variant B subject"
                  title="Preview with subject variant B"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                </Button>
              )}
              {body && (
                <Button
                  type="button" variant="ghost" size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setPreviewVariantB(false);
                    setPreviewing(true);
                  }}
                  aria-label="Preview email"
                  title="Preview how this email looks in an inbox"
                >
                  <Eye className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                type="button" variant="ghost" size="icon"
                className="h-7 w-7 text-muted-foreground"
                onClick={copyEmail}
                aria-label="Copy email"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
              {mode !== "sent" && (
                <Button
                  type="button" variant="ghost" size="icon"
                  className="h-7 w-7 text-destructive"
                  disabled={deleting}
                  onClick={deleteProspect}
                  aria-label="Delete prospect"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                type="button" variant="ghost" size="icon"
                className="h-7 w-7"
                onClick={() => setExpanded((v) => !v)}
                aria-label={expanded ? "Collapse" : "Expand"}
              >
                {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>

          {/* Collapsed body preview — tappable to expand */}
          {!expanded && bodyText && (
            <p
              className="mt-2 cursor-pointer text-[11px] leading-relaxed text-muted-foreground"
              onClick={() => setExpanded(true)}
            >
              {preview}
              {bodyText.length > PREVIEW_LEN && (
                <span className="ml-1 text-primary">more</span>
              )}
            </p>
          )}
        </CardHeader>

        {/* ── Expanded body ── */}
        {expanded && (
          <CardContent className="space-y-3 pt-0">
            {mode === "sent" ? (
              <div className="space-y-3">
                <p className="text-xs font-medium text-muted-foreground">Subject</p>
                <p className="text-xs font-semibold">{subject}</p>
                <p className="whitespace-pre-wrap rounded-lg bg-muted/40 px-3 py-2 text-xs leading-relaxed">
                  {bodyText}
                </p>
                {/* Klaviyo step 9 — operator manually closes the conversion loop */}
                <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row sm:flex-wrap">
                  <Button
                    type="button"
                    variant={repliedAt ? "default" : "secondary"}
                    className="h-9 w-full text-xs sm:flex-1"
                    onClick={() => void markFlag("replied", !repliedAt)}
                  >
                    <Reply className="mr-1.5 h-3.5 w-3.5" />
                    {repliedAt ? "Replied ✓ (click to clear)" : "Mark as replied"}
                  </Button>
                  <Button
                    type="button"
                    className={`h-9 w-full text-xs text-white sm:flex-1 ${
                      bookedAt ? "bg-emerald-700 hover:bg-emerald-600" : "bg-emerald-600 hover:bg-emerald-500"
                    }`}
                    onClick={() => void markFlag("booked", !bookedAt)}
                  >
                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                    {bookedAt ? "Booked ✓ (click to clear)" : "Mark as paying customer"}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor={`subj-${id}`} className="text-xs">Subject line</Label>
                  <Input
                    id={`subj-${id}`}
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="h-9 text-xs"
                    readOnly={mode === "approved"}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`body-${id}`} className="text-xs">Email body (HTML)</Label>
                  <Textarea
                    id={`body-${id}`}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={8}
                    className="min-h-[140px] resize-y font-mono text-[10px] leading-relaxed"
                    readOnly={mode === "approved"}
                  />
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  {mode === "review" && (
                    <>
                      <Button type="button" variant="secondary" className="h-10 w-full text-xs sm:flex-1" disabled={saving} onClick={save}>
                        {saving ? "Saving…" : "Save edits"}
                      </Button>
                      <Button type="button" className="h-10 w-full bg-emerald-600 text-xs text-white hover:bg-emerald-500 sm:flex-1" onClick={() => void setStatus("approved")}>
                        Approve
                      </Button>
                      <Button type="button" variant="destructive" className="h-10 w-full text-xs sm:flex-1" onClick={() => void setStatus("rejected")}>
                        Reject
                      </Button>
                    </>
                  )}
                  {mode === "approved" && (
                    <Button type="button" className="h-10 w-full bg-blue-600 text-xs text-white hover:bg-blue-500" disabled={sending} onClick={sendNow}>
                      <Send className="mr-1.5 h-3.5 w-3.5" />
                      {sending ? "Sending…" : `Send to ${email}`}
                    </Button>
                  )}
                </div>
              </>
            )}
          </CardContent>
        )}
      </Card>
    </>
  );
}

export function OutreachScreen() {
  const [campaign, setCampaign] = useState<Campaign>("pesttrace");
  const [reviewProspects, setReviewProspects] = useState<Prospect[]>([]);
  const [approvedProspects, setApprovedProspects] = useState<Prospect[]>([]);
  const [sentProspects, setSentProspects] = useState<Prospect[]>([]);
  const [rejectedProspects, setRejectedProspects] = useState<Prospect[]>([]);
  const [hotProspects, setHotProspects] = useState<Prospect[]>([]);
  const [stats, setStats] = useState<CampaignStats | null>(null);
  const [country, setCountry] = useState<string>("all");
  const [bulkSending, setBulkSending] = useState(false);
  const [dispatching, setDispatching] = useState(false);

  const loadStats = useCallback(async (forCampaign: Campaign) => {
    const res = await fetch(`/api/outreach-prospects/stats?campaign=${forCampaign}`);
    if (res.ok) setStats(await res.json());
    else setStats(null);
  }, []);

  const load = useCallback(
    async (forCampaign: Campaign = campaign) => {
      const q = `campaign=${forCampaign}`;
      void loadStats(forCampaign);
      const [review, approved, sent, rejected, hot] = await Promise.all([
        fetch(`/api/outreach-prospects?status=draft_ready&${q}`),
        fetch(`/api/outreach-prospects?status=approved&${q}`),
        fetch(`/api/outreach-prospects?status=sent&${q}`),
        fetch(`/api/outreach-prospects?status=rejected&${q}`),
        fetch(`/api/outreach-prospects?hot=1&${q}`),
      ]);
      if (review.ok) setReviewProspects(await review.json());
      if (approved.ok) setApprovedProspects(await approved.json());
      if (sent.ok) setSentProspects(await sent.json());
      if (rejected.ok) setRejectedProspects(await rejected.json());
      if (hot.ok) setHotProspects(await hot.json());
    },
    [campaign, loadStats],
  );

  // Re-load whenever the operator switches campaign tab
  useEffect(() => {
    setStats(null);
    void load(campaign);
  }, [campaign, load]);

  const filterByCountry = (prospects: Prospect[]) =>
    country === "all" ? prospects : prospects.filter((p) => String(p.country) === country);

  const runOutreachEngine = async () => {
    setDispatching(true);
    try {
      const res = await fetch("/api/trigger-outreach-engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign }),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

      const manualUrl =
        typeof data.manualUrl === "string" ? data.manualUrl : githubOutreachWorkflowUrl();
      const logsUrl = typeof data.logsUrl === "string" ? data.logsUrl : manualUrl;

      if (res.ok && data.ok) {
        toast.success(String(data.message ?? "Outreach engine dispatched."), {
          duration: 10_000,
          action: logsUrl
            ? {
                label: "Open Actions",
                onClick: () => window.open(logsUrl, "_blank", "noopener,noreferrer"),
              }
            : undefined,
        });
        return;
      }

      const msg = typeof data.error === "string" ? data.error : `HTTP ${res.status}`;
      const hint = typeof data.hint === "string" ? data.hint : "";
      toast.error(hint ? `${msg}\n\n${hint.slice(0, 280)}` : msg, {
        duration: 20_000,
        ...(manualUrl
          ? {
              action: {
                label: "Open workflow",
                onClick: () => window.open(manualUrl, "_blank", "noopener,noreferrer"),
              },
            }
          : {}),
      });
    } catch {
      toast.error("Could not reach /api/trigger-outreach-engine");
    } finally {
      setDispatching(false);
    }
  };

  const bulkSend = async () => {
    setBulkSending(true);
    try {
      const res = await fetch("/api/outreach-prospects/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bulk: true, campaign }),
      });
      const data = await res.json().catch(() => ({})) as Record<string, unknown>;
      if (!res.ok) {
        const hint = typeof data.hint === "string" ? `\n${data.hint}` : "";
        toast.error(`${typeof data.error === "string" ? data.error : "Bulk send failed"}${hint}`, { duration: 15000 });
        return;
      }
      const sent = typeof data.sent === "number" ? data.sent : 0;
      const failed = typeof data.failed === "number" ? data.failed : 0;
      const firstError = typeof data.firstError === "string" ? data.firstError : null;
      if (sent === 0 && failed > 0) {
        // All sends failed — surface as an error toast with the underlying SMTP reason
        // so the operator can act (commonly: Brevo IP allowlist, unverified sender, expired creds).
        toast.error(
          `0 emails sent, ${failed} failed${firstError ? `:\n${firstError}` : ""}`,
          { duration: 15000 },
        );
      } else if (failed > 0) {
        // Partial failure — show as warning-style toast with the reason for the failed ones
        toast.error(
          `Sent ${sent}, but ${failed} failed${firstError ? ` (${firstError})` : ""}`,
          { duration: 12000 },
        );
      } else {
        toast.success(`Sent ${sent} emails`);
      }
      await load(campaign);
    } finally { setBulkSending(false); }
  };

  const meta = CAMPAIGN_META[campaign];
  const reviewList = filterByCountry(reviewProspects);
  const approvedList = filterByCountry(approvedProspects);
  const sentList = filterByCountry(sentProspects);
  const rejectedList = filterByCountry(rejectedProspects);

  const empty = (msg: string) => (
    <p className="py-8 text-center text-sm text-muted-foreground">{msg}</p>
  );

  return (
    <div className="min-w-0 space-y-3">
      {/* Campaign selector — switches the entire screen between PestTrace and Weathers */}
      <Tabs value={campaign} onValueChange={(v) => setCampaign(v === "weathers" ? "weathers" : "pesttrace")}>
        <TabsList className="grid w-full grid-cols-2 md:inline-flex">
          <TabsTrigger value="pesttrace" className="text-xs sm:text-sm">
            {CAMPAIGN_META.pesttrace.label}
          </TabsTrigger>
          <TabsTrigger value="weathers" className="text-xs sm:text-sm">
            {CAMPAIGN_META.weathers.label}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Run engine — dispatches the dedicated outreach workflow for the selected campaign */}
      <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            Generate new email drafts — <span className="text-foreground">{meta.label}</span>
          </p>
          <p className="text-xs text-muted-foreground">{meta.blurb}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Sender: <span className="font-mono">{meta.fromEmail}</span> · Target: {meta.countries}
          </p>
        </div>
        <Button
          size="lg"
          className="h-11 shrink-0 px-5 text-sm sm:h-12 sm:text-base"
          onClick={runOutreachEngine}
          type="button"
          disabled={dispatching}
        >
          {dispatching ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          {dispatching ? "Dispatching…" : `Run ${meta.short} engine`}
        </Button>
      </div>

      {/* KPI panel — conversion funnel + hot leads + webhook revenue */}
      <StatsPanel stats={stats} />
      {(stats?.hot_leads ?? 0) > 0 && (
        <div className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-xs text-orange-200">
          <span className="font-medium text-orange-100">{stats?.hot_leads} hot lead(s)</span>
          {" — clicked your CTA recently. Prioritize the Hot leads tab and follow up while intent is high."}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={country} onValueChange={(v) => setCountry(typeof v === "string" ? v : "all")}>
          <SelectTrigger className="h-9 flex-1 text-sm md:max-w-48">
            <SelectValue placeholder="All countries" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All countries</SelectItem>
            {campaign === "pesttrace" ? (
              <>
                <SelectItem value="DE">Germany</SelectItem>
                <SelectItem value="FR">France</SelectItem>
                <SelectItem value="ES">Spain</SelectItem>
                <SelectItem value="IT">Italy</SelectItem>
                <SelectItem value="NL">Netherlands</SelectItem>
                <SelectItem value="IN">India</SelectItem>
                <SelectItem value="IE">Ireland</SelectItem>
                <SelectItem value="UK">UK</SelectItem>
                <SelectItem value="US">USA</SelectItem>
                <SelectItem value="CA">Canada</SelectItem>
                <SelectItem value="AU">Australia</SelectItem>
              </>
            ) : (
              <SelectItem value="UK">UK</SelectItem>
            )}
          </SelectContent>
        </Select>
        <span className="shrink-0 text-xs text-muted-foreground">
          {reviewProspects.length}r · {approvedProspects.length}a · {sentProspects.length}sent
        </span>
      </div>

      <Tabs defaultValue="review" className="min-w-0">
        <TabsList className="grid w-full grid-cols-5 md:inline-flex">
          <TabsTrigger value="hot" className="text-xs sm:text-sm">
            Hot leads
            {hotProspects.length > 0 && (
              <span className="ml-1 hidden rounded-full bg-orange-600/30 px-1 text-[10px] sm:inline-block">
                {hotProspects.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="review" className="text-xs sm:text-sm">
            Review
            {reviewProspects.length > 0 && (
              <span className="ml-1 hidden rounded-full bg-primary/20 px-1 text-[10px] sm:inline-block">
                {reviewProspects.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="approved" className="text-xs sm:text-sm">
            Approved
            {approvedProspects.length > 0 && (
              <span className="ml-1 hidden rounded-full bg-emerald-600/20 px-1 text-[10px] sm:inline-block">
                {approvedProspects.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="sent" className="text-xs sm:text-sm">Sent</TabsTrigger>
          <TabsTrigger value="rejected" className="text-xs sm:text-sm">Rejected</TabsTrigger>
        </TabsList>

        <TabsContent value="hot" className="mt-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            Prospects who clicked your CTA (high intent). Call or email while they are warm — webhook may auto-mark paying customers when they book.
          </p>
          {filterByCountry(hotProspects).length
            ? filterByCountry(hotProspects).map((p) => (
                <ProspectCard key={String(p.id)} prospect={p} mode="sent" onRefresh={() => load(campaign)} />
              ))
            : empty("No hot leads for this campaign yet — clicks on your booking/signup link appear here.")}
        </TabsContent>

        <TabsContent value="review" className="mt-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            Review each LLM-generated email. Edit if needed, then Approve to queue for sending.
          </p>
          {reviewList.length
            ? reviewList.map((p) => <ProspectCard key={String(p.id)} prospect={p} mode="review" onRefresh={() => load(campaign)} />)
            : empty(`No ${meta.short} emails to review — click "Run ${meta.short} engine" above to generate new drafts.`)}
        </TabsContent>

        <TabsContent value="approved" className="mt-3 space-y-2">
          {approvedList.length > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{approvedList.length} email{approvedList.length !== 1 ? "s" : ""} ready to send.</p>
              <Button type="button" variant="secondary" className="h-8 text-xs" disabled={bulkSending} onClick={() => void bulkSend()}>
                <Send className="mr-1.5 h-3.5 w-3.5" />
                {bulkSending ? "Sending all…" : "Send all approved"}
              </Button>
            </div>
          )}
          {approvedList.length
            ? approvedList.map((p) => <ProspectCard key={String(p.id)} prospect={p} mode="approved" onRefresh={() => load(campaign)} />)
            : empty("No approved emails — approve items from the Review tab.")}
        </TabsContent>

        <TabsContent value="sent" className="mt-3 space-y-2">
          {sentList.length
            ? sentList.map((p) => <ProspectCard key={String(p.id)} prospect={p} mode="sent" onRefresh={() => load(campaign)} />)
            : empty("No emails sent yet.")}
        </TabsContent>

        <TabsContent value="rejected" className="mt-3 space-y-2">
          {rejectedList.length
            ? rejectedList.map((p) => <ProspectCard key={String(p.id)} prospect={p} mode="rejected" onRefresh={() => load(campaign)} />)
            : empty("No rejected prospects.")}
        </TabsContent>
      </Tabs>
    </div>
  );
}
