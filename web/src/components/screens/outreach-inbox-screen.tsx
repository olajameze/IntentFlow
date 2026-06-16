"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

type Thread = {
  id: string;
  name: string | null;
  email: string;
  campaign: string;
  engagement_tier?: string;
  preview?: string | null;
  replied_at?: string | null;
};

type Message = {
  id: string;
  direction: string;
  subject?: string | null;
  body_text?: string | null;
  occurred_at: string;
};

type TimelineEvent = {
  type: string;
  title: string;
  occurred_at: string;
};

export function OutreachInboxScreen() {
  const [campaign, setCampaign] = useState("all");
  const [filter, setFilter] = useState("needs_reply");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [prospect, setProspect] = useState<Record<string, unknown> | null>(null);
  const [replySubject, setReplySubject] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [jobAmount, setJobAmount] = useState("");
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);

  const loadThreads = useCallback(async () => {
    const q = new URLSearchParams({ filter, limit: "50" });
    if (campaign !== "all") q.set("campaign", campaign);
    const res = await fetch(`/api/outreach-inbox?${q}`);
    if (res.ok) setThreads(await res.json());
  }, [campaign, filter]);

  const loadThread = useCallback(async (id: string) => {
    setSelectedId(id);
    const res = await fetch(`/api/outreach-inbox/${id}`);
    if (!res.ok) {
      toast.error("Could not load thread");
      return;
    }
    const data = await res.json();
    setProspect(data.prospect);
    setMessages(data.messages ?? []);
    const tlRes = await fetch(`/api/customers/${id}/timeline`);
    if (tlRes.ok) {
      const tl = await tlRes.json();
      setTimeline(tl.events ?? []);
    } else {
      setTimeline([]);
    }
  }, []);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  const suggestReply = async () => {
    if (!selectedId) return;
    const res = await fetch(`/api/outreach-inbox/${selectedId}/suggest-reply`, { method: "POST" });
    if (!res.ok) {
      toast.error("Could not suggest reply");
      return;
    }
    const draft = await res.json();
    setReplySubject(draft.subject || "");
    setReplyBody(draft.body || "");
    toast.success("Draft ready — edit and send");
  };

  const sendReply = async () => {
    if (!selectedId) return;
    const res = await fetch(`/api/outreach-inbox/${selectedId}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: replySubject, body: replyBody }),
    });
    if (!res.ok) {
      toast.error("Send failed");
      return;
    }
    toast.success("Reply sent");
    setReplyBody("");
    void loadThread(selectedId);
    void loadThreads();
  };

  const patchAction = async (action: string, extra?: Record<string, unknown>) => {
    if (!selectedId) return;
    const res = await fetch(`/api/outreach-inbox/${selectedId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    if (!res.ok) {
      toast.error("Update failed");
      return;
    }
    toast.success("Updated");
    void loadThread(selectedId);
    void loadThreads();
  };

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <Card className="min-w-0">
        <CardHeader className="space-y-3">
          <CardTitle className="text-base">Inbox</CardTitle>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={campaign} onValueChange={(v) => setCampaign(typeof v === "string" ? v : "all")}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All campaigns</SelectItem>
                <SelectItem value="pesttrace">PestTrace</SelectItem>
                <SelectItem value="weathers">Weathers</SelectItem>
                <SelectItem value="jgdevs">JGDevs</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filter} onValueChange={(v) => setFilter(typeof v === "string" ? v : "needs_reply")}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="needs_reply">Needs reply</SelectItem>
                <SelectItem value="hot">Hot leads</SelectItem>
                <SelectItem value="all">All sent</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="max-h-[32rem] space-y-2 overflow-y-auto p-3 pt-0">
          {threads.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => void loadThread(t.id)}
              className={`w-full rounded-lg border p-3 text-left text-sm transition hover:bg-muted/60 ${
                selectedId === t.id ? "border-primary bg-muted/40" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium truncate">{t.name || t.email}</span>
                {t.engagement_tier === "hot" ? <Badge variant="destructive">Hot</Badge> : null}
              </div>
              <p className="text-xs text-muted-foreground">{t.campaign}</p>
              {t.preview ? <p className="mt-1 line-clamp-2 text-xs">{t.preview}</p> : null}
            </button>
          ))}
          {!threads.length ? <p className="text-sm text-muted-foreground">No threads match this filter.</p> : null}
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="text-base">
            {prospect ? String(prospect.name || prospect.email || "Conversation") : "Select a thread"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-h-64 space-y-3 overflow-y-auto rounded-lg border bg-muted/20 p-3">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`rounded-md p-2 text-sm ${
                  m.direction === "inbound" ? "bg-background border ml-0 mr-8" : "bg-primary/10 ml-8 mr-0"
                }`}
              >
                <p className="text-xs font-medium text-muted-foreground">
                  {m.direction} · {new Date(m.occurred_at).toLocaleString()}
                </p>
                {m.subject ? <p className="font-medium">{m.subject}</p> : null}
                <p className="whitespace-pre-wrap">{m.body_text}</p>
              </div>
            ))}
            {!messages.length && selectedId ? (
              <p className="text-sm text-muted-foreground">No messages stored yet.</p>
            ) : null}
          </div>

          {selectedId ? (
            <>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={() => void patchAction("interested")}>
                  Interested
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => void patchAction("not_a_fit")}>
                  Not a fit
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => void patchAction("pause")}>
                  Pause sequence
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => void suggestReply()}>
                  Suggest reply
                </Button>
              </div>

              {String(prospect?.campaign) === "weathers" ? (
                <div className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
                  <div className="space-y-1">
                    <Label>Job amount (£)</Label>
                    <Input value={jobAmount} onChange={(e) => setJobAmount(e.target.value)} className="h-9 w-28" />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() =>
                      void patchAction("log_job", {
                        amount: Number(jobAmount),
                        description: "Weathers job — inbox",
                      })
                    }
                  >
                    Log job complete
                  </Button>
                </div>
              ) : null}

              {timeline.length ? (
                <div className="rounded-lg border p-3">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Customer timeline</p>
                  <ul className="max-h-32 space-y-2 overflow-y-auto text-xs">
                    {timeline.map((ev, i) => (
                      <li key={`${ev.occurred_at}-${i}`} className="border-l-2 border-muted pl-2">
                        <span className="text-muted-foreground">{new Date(ev.occurred_at).toLocaleString()}</span>
                        {" · "}
                        <span className="font-medium">{ev.title}</span>
                        <span className="text-muted-foreground"> ({ev.type})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="space-y-2">
                <Label>Reply</Label>
                <Input value={replySubject} onChange={(e) => setReplySubject(e.target.value)} placeholder="Subject" />
                <Textarea value={replyBody} onChange={(e) => setReplyBody(e.target.value)} rows={6} />
                <Button type="button" className="h-11 w-full" onClick={() => void sendReply()}>
                  Send reply
                </Button>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
