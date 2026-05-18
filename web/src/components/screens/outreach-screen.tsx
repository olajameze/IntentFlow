"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronDown, ChevronUp, Copy, Globe, Mail, Send, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    <Card className="border border-border/80 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm font-semibold">{name}</span>
              <Badge variant="outline" className={`text-[10px] ${countryBadgeClass(country)}`}>
                {COUNTRY_LABELS[country] ?? country}
              </Badge>
              {city && <span className="text-[11px] text-muted-foreground">{city}</span>}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-0.5">
                <Mail className="h-3 w-3" />{email}
              </span>
              {website && (
                <a href={website} target="_blank" rel="noopener noreferrer"
                   className="flex items-center gap-0.5 hover:text-foreground hover:underline">
                  <Globe className="h-3 w-3" />website
                </a>
              )}
              {sentAt && <span>Sent {new Date(sentAt).toLocaleDateString()}</span>}
            </div>
            {subject && (
              <p className="mt-1 text-[11px] font-medium text-foreground/80 italic">&ldquo;{subject}&rdquo;</p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={copyEmail} aria-label="Copy email">
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
            {mode !== "sent" && (
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" disabled={deleting} onClick={deleteProspect} aria-label="Delete">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExpanded((v) => !v)} aria-label={expanded ? "Collapse" : "Expand"}>
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>

        {/* Body preview — collapsed */}
        {!expanded && bodyText && (
          <p className="mt-2 cursor-pointer text-[11px] leading-relaxed text-muted-foreground" onClick={() => setExpanded(true)}>
            {preview}
            {bodyText.length > PREVIEW_LEN && <span className="ml-1 text-primary">more</span>}
          </p>
        )}
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-3 pt-0">
          {mode === "sent" ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Subject</p>
              <p className="text-xs font-semibold">{subject}</p>
              <p className="whitespace-pre-wrap rounded-lg bg-muted/40 px-3 py-2 text-xs leading-relaxed">{bodyText}</p>
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
  );
}

export function OutreachScreen() {
  const [reviewProspects, setReviewProspects] = useState<Prospect[]>([]);
  const [approvedProspects, setApprovedProspects] = useState<Prospect[]>([]);
  const [sentProspects, setSentProspects] = useState<Prospect[]>([]);
  const [rejectedProspects, setRejectedProspects] = useState<Prospect[]>([]);
  const [country, setCountry] = useState<string>("all");
  const [bulkSending, setBulkSending] = useState(false);

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
            : empty("No emails to review — run the engine: python main.py outreach")}
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
