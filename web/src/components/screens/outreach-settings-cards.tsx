"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type AlertRule = {
  id: string;
  campaign: string;
  events: string[];
  to_emails: string[];
  enabled: boolean;
};

type SuppressionRow = {
  id: string;
  email: string;
  reason: string;
  campaign: string | null;
  created_at: string;
};

const ALERT_EVENTS = ["reply", "hot_lead", "booked", "converted", "interested", "meeting_booked", "bounce_rate_high"];

export function OutreachAlertRulesCard() {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [form, setForm] = useState({
    campaign: "all",
    events: ["reply", "hot_lead"] as string[],
    to_emails: "",
    enabled: true,
  });

  const load = async () => {
    const res = await fetch("/api/outreach-alerts");
    if (res.ok) setRules(await res.json());
  };

  useEffect(() => {
    void load();
  }, []);

  const toggleEvent = (event: string) => {
    setForm((prev) => ({
      ...prev,
      events: prev.events.includes(event) ? prev.events.filter((e) => e !== event) : [...prev.events, event],
    }));
  };

  const create = async () => {
    const emails = form.to_emails.split(/[,;\s]+/).map((e) => e.trim()).filter(Boolean);
    if (!emails.length) {
      toast.error("Add at least one recipient email");
      return;
    }
    const res = await fetch("/api/outreach-alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, to_emails: emails }),
    });
    if (!res.ok) {
      toast.error("Could not create rule");
      return;
    }
    toast.success("Alert rule created");
    setForm({ campaign: "all", events: ["reply", "hot_lead"], to_emails: "", enabled: true });
    void load();
  };

  const toggleEnabled = async (rule: AlertRule, enabled: boolean) => {
    await fetch("/api/outreach-alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: rule.id, enabled }),
    });
    void load();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Outreach email alerts</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Email-only alerts on reply, hot lead, conversion, and high bounce rate. Fallback:{" "}
          <code className="text-xs">OUTREACH_ALERT_TO_EMAIL</code> when no rules exist.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Campaign</Label>
            <Select value={form.campaign} onValueChange={(v) => setForm((f) => ({ ...f, campaign: typeof v === "string" ? v : f.campaign }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All campaigns</SelectItem>
                <SelectItem value="pesttrace">PestTrace</SelectItem>
                <SelectItem value="weathers">Weathers</SelectItem>
                <SelectItem value="jgdevs">JGDevs</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Recipient emails (comma-separated)</Label>
            <Input value={form.to_emails} onChange={(e) => setForm((f) => ({ ...f, to_emails: e.target.value }))} placeholder="ops@example.com" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {ALERT_EVENTS.map((ev) => (
            <Button
              key={ev}
              type="button"
              size="sm"
              variant={form.events.includes(ev) ? "default" : "outline"}
              onClick={() => toggleEvent(ev)}
            >
              {ev}
            </Button>
          ))}
        </div>
        <Button type="button" onClick={() => void create()}>Add alert rule</Button>
        {rules.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead>Events</TableHead>
                <TableHead>Recipients</TableHead>
                <TableHead>On</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.campaign}</TableCell>
                  <TableCell className="text-xs">{(r.events ?? []).join(", ")}</TableCell>
                  <TableCell className="text-xs">{(r.to_emails ?? []).join(", ")}</TableCell>
                  <TableCell>
                    <Switch checked={r.enabled} onCheckedChange={(v) => void toggleEnabled(r, v)} aria-label="Toggle rule" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function SuppressionListCard() {
  const [rows, setRows] = useState<SuppressionRow[]>([]);
  const [q, setQ] = useState("");
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("manual");

  const load = useCallback(async () => {
    const params = q ? `?q=${encodeURIComponent(q)}` : "";
    const res = await fetch(`/api/suppression-list${params}`);
    if (res.ok) setRows(await res.json());
  }, [q]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    if (!email.trim()) return;
    const res = await fetch("/api/suppression-list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, reason }),
    });
    if (!res.ok) {
      toast.error("Could not add");
      return;
    }
    toast.success("Added to suppression list");
    setEmail("");
    void load();
  };

  const remove = async (id: string) => {
    const res = await fetch(`/api/suppression-list?id=${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Could not remove");
      return;
    }
    void load();
  };

  const exportCsv = () => {
    const header = "email,reason,campaign,created_at\n";
    const body = rows.map((r) => `${r.email},${r.reason},${r.campaign ?? ""},${r.created_at}`).join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "suppression-list.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Suppression centre (DNC)</CardTitle>
        <Button type="button" variant="outline" size="sm" onClick={exportCsv}>Export CSV</Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Global do-not-contact list. Sends are blocked for matching emails. Auto-added on bounce, spam, and unsubscribe.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input placeholder="Search email…" value={q} onChange={(e) => setQ(e.target.value)} />
          <Input placeholder="Add email…" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Select value={reason} onValueChange={(v) => setReason(typeof v === "string" ? v : reason)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">Manual</SelectItem>
              <SelectItem value="unsubscribe">Unsubscribe</SelectItem>
              <SelectItem value="bounce">Bounce</SelectItem>
              <SelectItem value="complaint">Complaint</SelectItem>
            </SelectContent>
          </Select>
          <Button type="button" onClick={() => void add()}>Add</Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Campaign</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.email}</TableCell>
                <TableCell>{r.reason}</TableCell>
                <TableCell>{r.campaign ?? "global"}</TableCell>
                <TableCell className="text-right">
                  <Button type="button" variant="ghost" size="sm" onClick={() => void remove(r.id)}>Remove</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function HubSpotConnectionCard() {
  const [status, setStatus] = useState<{ ok?: boolean; account?: string; error?: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [tested, setTested] = useState(false);

  const test = async () => {
    setTested(true);
    const res = await fetch("/api/integrations/hubspot/sync");
    setStatus(await res.json());
    if (res.ok) toast.success("HubSpot connected");
    else toast.message("HubSpot not configured — outreach still works without it");
  };

  const syncBatch = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/integrations/hubspot/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 25 }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Sync failed");
        return;
      }
      toast.success(`Synced ${data.synced ?? 0} prospect(s)`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Optional — HubSpot CRM</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Only if you already use HubSpot: add <code className="text-xs">HUBSPOT_ACCESS_TOKEN</code> to sync contacts
          on reply and conversion. No new account is required for core outreach — your existing SMTP or Resend setup is enough.
        </p>
        {tested && status ? (
          <p className={status.ok ? "text-emerald-600" : "text-muted-foreground"}>
            {status.ok ?
              `Connected${status.account ? ` — ${status.account}` : ""}`
            : "Not configured — optional"}
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => void test()}>Test connection</Button>
          <Button type="button" onClick={() => void syncBatch()} disabled={syncing}>
            {syncing ? "Syncing…" : "Sync recent replies"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
