"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronDown, ChevronUp, Copy, Eye, Globe, Loader2, Mail, Send, Sparkles, Trash2, X } from "lucide-react";
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
  onClose,
}: {
  subject: string;
  html: string;
  recipientEmail: string;
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
            <p className="text-xs font-semibold text-gray-700">PestTrace Team &lt;pesttrace@gmail.com&gt;</p>
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

const COUNTRY_LABELS: Record<string, string> = { UK: "UK", US: "USA", CA: "Canada", AU: "Australia" };
const PREVIEW_LEN = 140;

function countryBadgeClass(country: string) {
  if (country === "UK") return "bg-blue-600/15 text-blue-400 border-blue-600/30";
  if (country === "US") return "bg-red-600/15 text-red-400 border-red-600/30";
  if (country === "CA") return "bg-orange-600/15 text-orange-400 border-orange-600/30";
  if (country === "AU") return "bg-emerald-600/15 text-emerald-400 border-emerald-600/30";
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

  const [subject, setSubject] = useState(String(prospect.email_subject ?? ""));
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
          subject={subject}
          html={body}
          recipientEmail={email}
          onClose={() => setPreviewing(false)}
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
                {city && <span className="shrink-0 text-[11px] text-muted-foreground">{city}</span>}
              </div>
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
                </p>
              )}
            </div>

            {/* Right: icon buttons — fixed width, never wrap */}
            <div className="flex shrink-0 items-center">
              {body && (
                <Button
                  type="button" variant="ghost" size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={() => setPreviewing(true)}
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
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Subject</p>
                <p className="text-xs font-semibold">{subject}</p>
                <p className="whitespace-pre-wrap rounded-lg bg-muted/40 px-3 py-2 text-xs leading-relaxed">
                  {bodyText}
                </p>
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
  const [reviewProspects, setReviewProspects] = useState<Prospect[]>([]);
  const [approvedProspects, setApprovedProspects] = useState<Prospect[]>([]);
  const [sentProspects, setSentProspects] = useState<Prospect[]>([]);
  const [rejectedProspects, setRejectedProspects] = useState<Prospect[]>([]);
  const [country, setCountry] = useState<string>("all");
  const [bulkSending, setBulkSending] = useState(false);
  const [dispatching, setDispatching] = useState(false);

  const load = async () => {
    const [review, approved, sent, rejected] = await Promise.all([
      fetch("/api/outreach-prospects?status=draft_ready"),
      fetch("/api/outreach-prospects?status=approved"),
      fetch("/api/outreach-prospects?status=sent"),
      fetch("/api/outreach-prospects?status=rejected"),
    ]);
    if (review.ok) setReviewProspects(await review.json());
    if (approved.ok) setApprovedProspects(await approved.json());
    if (sent.ok) setSentProspects(await sent.json());
    if (rejected.ok) setRejectedProspects(await rejected.json());
  };

  useEffect(() => { void load(); }, []);

  const filterByCountry = (prospects: Prospect[]) =>
    country === "all" ? prospects : prospects.filter((p) => String(p.country) === country);

  const runOutreachEngine = async () => {
    setDispatching(true);
    try {
      const res = await fetch("/api/trigger-outreach-engine", { method: "POST" });
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
        body: JSON.stringify({ bulk: true }),
      });
      const data = await res.json().catch(() => ({})) as Record<string, unknown>;
      if (!res.ok) {
        const hint = typeof data.hint === "string" ? `\n${data.hint}` : "";
        toast.error(`${typeof data.error === "string" ? data.error : "Bulk send failed"}${hint}`, { duration: 12000 });
        return;
      }
      toast.success(`Sent ${data.sent ?? 0} emails${data.failed ? `, ${data.failed} failed` : ""}`);
      await load();
    } finally { setBulkSending(false); }
  };

  const reviewList = filterByCountry(reviewProspects);
  const approvedList = filterByCountry(approvedProspects);
  const sentList = filterByCountry(sentProspects);
  const rejectedList = filterByCountry(rejectedProspects);

  const empty = (msg: string) => (
    <p className="py-8 text-center text-sm text-muted-foreground">{msg}</p>
  );

  return (
    <div className="min-w-0 space-y-3">
      {/* Run engine — dispatches the dedicated outreach workflow (scrape + draft emails) */}
      <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium">Generate new email drafts</p>
          <p className="text-xs text-muted-foreground">
            Scrapes fresh pest control businesses and drafts compliance-focused emails. Drafts appear in the Review tab.
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
          {dispatching ? "Dispatching…" : "Run outreach engine"}
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={country} onValueChange={(v) => setCountry(typeof v === "string" ? v : "all")}>
          <SelectTrigger className="h-9 flex-1 text-sm md:max-w-48">
            <SelectValue placeholder="All countries" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All countries</SelectItem>
            <SelectItem value="UK">UK</SelectItem>
            <SelectItem value="US">USA</SelectItem>
            <SelectItem value="CA">Canada</SelectItem>
            <SelectItem value="AU">Australia</SelectItem>
          </SelectContent>
        </Select>
        <span className="shrink-0 text-xs text-muted-foreground">
          {reviewProspects.length}r · {approvedProspects.length}a · {sentProspects.length}sent
        </span>
      </div>

      <Tabs defaultValue="review" className="min-w-0">
        <TabsList className="grid w-full grid-cols-4 md:inline-flex">
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

        <TabsContent value="review" className="mt-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            Review each LLM-generated email. Edit if needed, then Approve to queue for sending.
          </p>
          {reviewList.length
            ? reviewList.map((p) => <ProspectCard key={String(p.id)} prospect={p} mode="review" onRefresh={load} />)
            : empty("No emails to review — click \"Run outreach engine\" above to generate new drafts.")}
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
            ? approvedList.map((p) => <ProspectCard key={String(p.id)} prospect={p} mode="approved" onRefresh={load} />)
            : empty("No approved emails — approve items from the Review tab.")}
        </TabsContent>

        <TabsContent value="sent" className="mt-3 space-y-2">
          {sentList.length
            ? sentList.map((p) => <ProspectCard key={String(p.id)} prospect={p} mode="sent" onRefresh={load} />)
            : empty("No emails sent yet.")}
        </TabsContent>

        <TabsContent value="rejected" className="mt-3 space-y-2">
          {rejectedList.length
            ? rejectedList.map((p) => <ProspectCard key={String(p.id)} prospect={p} mode="rejected" onRefresh={load} />)
            : empty("No rejected prospects.")}
        </TabsContent>
      </Tabs>
    </div>
  );
}
