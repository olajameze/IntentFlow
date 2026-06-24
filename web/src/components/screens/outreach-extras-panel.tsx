"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import styles from "./outreach-extras-panel.module.css";

type Campaign = "pesttrace" | "weathers" | "jgdevs" | "breazy";

type FunnelStage = { key: string; label: string; count: number };

type LinkedInTask = {
  id: string;
  prospect_id: string;
  suggested_note: string;
  status: string;
  due_at?: string | null;
  outreach_prospects?: { name?: string; email?: string; campaign?: string };
};

type CallTask = {
  id: string;
  prospect_id: string;
  trigger: string;
  opening_script: string;
  talking_points: string[];
  objection_handling: Array<{ objection: string; response: string }>;
  suggested_next_step: string;
  chat_url: string;
  script_copy: string;
  chat_transcript: Array<{ role: string; content: string }>;
  outreach_prospects?: {
    name?: string;
    email?: string;
    phone?: string;
    campaign?: string;
    engagement_tier?: string;
  };
};

type SocialSignal = {
  id: string;
  name?: string;
  email?: string;
  website_url?: string;
  campaign?: string;
};

type Deliverability = {
  sent: number;
  delivered: number;
  bounced: number;
  delivery_rate: number;
  bounce_rate: number;
  inbox_pending: number;
};

const OUTCOMES = ["book", "demo", "callback", "not_ready", "unqualified"] as const;

export function OutreachExtrasPanel({ campaign }: { campaign: Campaign }) {
  const [funnel, setFunnel] = useState<FunnelStage[]>([]);
  const [deliverability, setDeliverability] = useState<Deliverability | null>(null);
  const [linkedin, setLinkedin] = useState<LinkedInTask[]>([]);
  const [callTasks, setCallTasks] = useState<CallTask[]>([]);
  const [signals, setSignals] = useState<SocialSignal[]>([]);
  const [expandedCall, setExpandedCall] = useState<string | null>(null);
  const [finishId, setFinishId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<(typeof OUTCOMES)[number]>("callback");
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    const [fRes, dRes, lRes, cRes, sRes] = await Promise.all([
      fetch(`/api/outreach-prospects/funnel?campaign=${campaign}`),
      fetch(`/api/outreach/deliverability?campaign=${campaign}`),
      fetch(`/api/outreach-linkedin-tasks?status=pending&campaign=${campaign}`),
      fetch(`/api/outreach-call-tasks?status=pending&campaign=${campaign}`),
      fetch("/api/outreach/social-signals"),
    ]);
    if (fRes.ok) {
      const data = await fRes.json();
      setFunnel(data.stages ?? []);
    }
    if (dRes.ok) setDeliverability(await dRes.json());
    if (lRes.ok) setLinkedin(await lRes.json());
    if (cRes.ok) setCallTasks(await cRes.json());
    if (sRes.ok) setSignals(await sRes.json());
  }, [campaign]);

  useEffect(() => {
    void load();
  }, [load]);

  const markLinkedIn = async (id: string, status: "done" | "skipped") => {
    const res = await fetch("/api/outreach-linkedin-tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (!res.ok) {
      toast.error("Update failed");
      return;
    }
    void load();
  };

  const markCallTask = async (id: string, status: "done" | "skipped") => {
    const body: Record<string, string> = { id, status };
    if (status === "done") {
      body.qualification_outcome = outcome;
      if (notes.trim()) body.operator_notes = notes.trim();
    }
    const res = await fetch("/api/outreach-call-tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      toast.error("Update failed");
      return;
    }
    setFinishId(null);
    setNotes("");
    toast.success(status === "done" ? "Call logged" : "Skipped");
    void load();
  };

  const approveSignal = async (id: string) => {
    const res = await fetch("/api/outreach/social-signals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve", id }),
    });
    if (!res.ok) {
      toast.error("Approve failed");
      return;
    }
    toast.success("Moved to draft pipeline");
    void load();
  };

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Copy failed");
    }
  };

  const maxFunnel = Math.max(1, ...funnel.map((s) => s.count));

  return (
    <div className="space-y-3">
      {deliverability ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Deliverability</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
            <div>
              <p className="text-muted-foreground">Delivery rate</p>
              <p className="font-semibold tabular-nums">{(deliverability.delivery_rate * 100).toFixed(1)}%</p>
            </div>
            <div>
              <p className="text-muted-foreground">Bounce rate</p>
              <p className={`font-semibold tabular-nums ${deliverability.bounce_rate > 0.03 ? "text-destructive" : ""}`}>
                {(deliverability.bounce_rate * 100).toFixed(1)}%
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">In-flight</p>
              <p className="font-semibold tabular-nums">{deliverability.inbox_pending}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Bounced</p>
              <p className="font-semibold tabular-nums">{deliverability.bounced}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {callTasks.length ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Call prep queue</CardTitle>
          </CardHeader>
          <CardContent className="max-h-64 space-y-2 overflow-y-auto">
            {callTasks.map((t) => {
              const p = t.outreach_prospects;
              const expanded = expandedCall === t.id;
              const transcript = Array.isArray(t.chat_transcript) ? t.chat_transcript : [];
              const lastChat = transcript.slice(-2);
              return (
                <div key={t.id} className="rounded-md border p-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{p?.name || p?.email || t.prospect_id}</span>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="outline">{t.trigger}</Badge>
                      {p?.engagement_tier ? (
                        <Badge variant="secondary">{p.engagement_tier}</Badge>
                      ) : null}
                    </div>
                  </div>
                  {p?.phone ? (
                    <p className="mt-1 text-muted-foreground">Phone: {p.phone}</p>
                  ) : null}
                  <p className="mt-1 line-clamp-2 text-muted-foreground">{t.opening_script}</p>
                  {lastChat.length ? (
                    <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                      Chat: {lastChat.map((m) => m.content).join(" · ")}
                    </p>
                  ) : null}
                  {expanded ? (
                    <div className="mt-2 space-y-2 rounded border bg-muted/30 p-2">
                      <p className="font-medium">Talking points</p>
                      <ul className="list-inside list-disc space-y-1">
                        {(t.talking_points || []).map((pt) => (
                          <li key={pt}>{pt}</li>
                        ))}
                      </ul>
                      {(t.objection_handling || []).map((o) => (
                        <div key={o.objection}>
                          <p className="font-medium">{o.objection}</p>
                          <p className="text-muted-foreground">{o.response}</p>
                        </div>
                      ))}
                      <p className="text-muted-foreground">{t.suggested_next_step}</p>
                    </div>
                  ) : null}
                  {finishId === t.id ? (
                    <div className="mt-2 space-y-2">
                      <select
                        value={outcome}
                        onChange={(e) => setOutcome(e.target.value as (typeof OUTCOMES)[number])}
                        className="w-full rounded border bg-background px-2 py-1"
                        aria-label="Call outcome"
                      >
                        {OUTCOMES.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Notes (optional)"
                        rows={2}
                        className="w-full rounded border bg-background px-2 py-1"
                      />
                      <div className="flex gap-2">
                        <Button type="button" size="sm" onClick={() => void markCallTask(t.id, "done")}>
                          Save
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setFinishId(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setExpandedCall(expanded ? null : t.id)}
                      >
                        {expanded ? "Hide" : "Details"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void copyText(t.script_copy, "Script")}
                      >
                        Copy script
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void copyText(t.chat_url, "Chat link")}
                      >
                        Copy chat link
                      </Button>
                      <Button type="button" size="sm" onClick={() => setFinishId(t.id)}>
                        Done
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => void markCallTask(t.id, "skipped")}>
                        Skip
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      {campaign === "pesttrace" && funnel.length ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">PestTrace snapshot funnel</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {funnel.map((stage) => (
              <div key={stage.key} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span>{stage.label}</span>
                  <span className="tabular-nums font-medium">{stage.count}</span>
                </div>
                <div className={styles.funnelTrack}>
                  <progress
                    value={stage.count}
                    max={maxFunnel}
                    aria-label={`${stage.label}: ${stage.count}`}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {(campaign === "jgdevs" || campaign === "pesttrace") && linkedin.length ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">LinkedIn task queue</CardTitle>
          </CardHeader>
          <CardContent className="max-h-48 space-y-2 overflow-y-auto">
            {linkedin.map((t) => {
              const p = t.outreach_prospects;
              return (
                <div key={t.id} className="rounded-md border p-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{p?.name || p?.email || t.prospect_id}</span>
                    <Badge variant="outline">{t.status}</Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-muted-foreground">{t.suggested_note}</p>
                  <div className="mt-2 flex gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(t.suggested_note)}>
                      Copy note
                    </Button>
                    <Button type="button" size="sm" onClick={() => void markLinkedIn(t.id, "done")}>Done</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => void markLinkedIn(t.id, "skipped")}>Skip</Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      {signals.length ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Imported prospect signals</CardTitle>
          </CardHeader>
          <CardContent className="max-h-40 space-y-2 overflow-y-auto">
            {signals.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-xs">
                <div>
                  <p className="font-medium">{s.name || s.email}</p>
                  <p className="text-muted-foreground">{s.campaign} · {s.website_url || "—"}</p>
                </div>
                <Button type="button" size="sm" onClick={() => void approveSignal(s.id)}>Approve</Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
