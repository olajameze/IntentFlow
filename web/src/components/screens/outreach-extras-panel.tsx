"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Campaign = "pesttrace" | "weathers" | "jgdevs";

type FunnelStage = { key: string; label: string; count: number };

type LinkedInTask = {
  id: string;
  prospect_id: string;
  suggested_note: string;
  status: string;
  due_at?: string | null;
  outreach_prospects?: { name?: string; email?: string; campaign?: string };
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

export function OutreachExtrasPanel({ campaign }: { campaign: Campaign }) {
  const [funnel, setFunnel] = useState<FunnelStage[]>([]);
  const [deliverability, setDeliverability] = useState<Deliverability | null>(null);
  const [linkedin, setLinkedin] = useState<LinkedInTask[]>([]);
  const [signals, setSignals] = useState<SocialSignal[]>([]);

  const load = useCallback(async () => {
    const [fRes, dRes, lRes, sRes] = await Promise.all([
      fetch(`/api/outreach-prospects/funnel?campaign=${campaign}`),
      fetch(`/api/outreach/deliverability?campaign=${campaign}`),
      fetch(`/api/outreach-linkedin-tasks?status=pending&campaign=${campaign}`),
      fetch("/api/outreach/social-signals"),
    ]);
    if (fRes.ok) {
      const data = await fRes.json();
      setFunnel(data.stages ?? []);
    }
    if (dRes.ok) setDeliverability(await dRes.json());
    if (lRes.ok) setLinkedin(await lRes.json());
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
                <div className="h-2 rounded-full bg-muted">
                  <div
                    className="h-2 rounded-full bg-primary transition-all"
                    style={{ width: `${Math.round((stage.count / maxFunnel) * 100)}%` }}
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
            <CardTitle className="text-sm">Social listening signals</CardTitle>
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
