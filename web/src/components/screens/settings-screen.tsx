"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Biz = {
  id: string;
  name: string;
  type: string;
  target_audience?: string | null;
  industry?: string | null;
  website_url?: string | null;
  goals?: string | null;
  umami_website_id?: string | null;
  active: boolean;
  has_stripe?: boolean;
};

type OutreachSettings = {
  business_id: string;
  enabled: boolean;
  campaign_slug: string;
  cta_url_template: string;
  conversion_webhook_secret: string | null;
};

function OutreachPortfolioCard({ businesses }: { businesses: Biz[] }) {
  const [settings, setSettings] = useState<OutreachSettings[]>([]);
  const [loading, setLoading] = useState(true);
  const siteBase =
    typeof window !== "undefined"
      ? window.location.origin
      : process.env.NEXT_PUBLIC_SITE_URL || "";

  const loadOutreach = async () => {
    const res = await fetch("/api/business-outreach");
    if (res.ok) setSettings(await res.json());
    setLoading(false);
  };

  useEffect(() => {
    void loadOutreach();
  }, [businesses.length]);

  const ensureSettings = async (businessId: string) => {
    const res = await fetch("/api/business-outreach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ business_id: businessId, enable: true }),
    });
    if (!res.ok) {
      toast.error("Could not init outreach settings");
      return null;
    }
    return (await res.json()) as OutreachSettings;
  };

  const toggleOutreach = async (biz: Biz, enabled: boolean) => {
    let row = settings.find((s) => s.business_id === biz.id);
    if (!row) row = (await ensureSettings(biz.id)) ?? undefined;
    if (!row) return;
    const res = await fetch("/api/business-outreach", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ business_id: biz.id, enabled }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast.error(typeof d.error === "string" ? d.error : "Update failed");
      return;
    }
    toast.success(enabled ? "Outreach enabled" : "Outreach disabled");
    void loadOutreach();
  };

  const bootstrapCopy = async (businessId: string) => {
    toast.message("Generating campaign copy…");
    const res = await fetch("/api/business-outreach/bootstrap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ business_id: businessId }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast.error(typeof d.error === "string" ? d.error : "Bootstrap failed");
      return;
    }
    toast.success("Campaign prompts generated — run outreach engine next");
    void loadOutreach();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Outreach & conversion webhooks</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          Enable cold email outreach per business. Add the webhook snippet on your book/payment page so paying customers are tracked automatically.
        </p>
        {loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : (
          businesses.map((biz) => {
            const row = settings.find((s) => s.business_id === biz.id);
            const webhookUrl = siteBase ? `${siteBase}/api/outreach-conversion` : "/api/outreach-conversion";
            return (
              <div key={biz.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{biz.name}</span>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground">Outreach</Label>
                    <Switch
                      checked={row?.enabled ?? false}
                      onCheckedChange={(v) => void toggleOutreach(biz, v)}
                      aria-label={`Outreach for ${biz.name}`}
                    />
                  </div>
                </div>
                {row && (
                  <>
                    <p className="text-xs text-muted-foreground">
                      Campaign slug: <span className="font-mono">{row.campaign_slug}</span>
                    </p>
                    <p className="text-[11px] font-mono break-all text-muted-foreground">
                      Webhook: {webhookUrl}
                      <br />
                      Secret: {row.conversion_webhook_secret ? "••••••" : "—"}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="secondary" onClick={() => void bootstrapCopy(biz.id)}>
                        Generate campaign copy
                      </Button>
                    </div>
                  </>
                )}
                {!row && (
                  <Button type="button" size="sm" variant="outline" onClick={() => void toggleOutreach(biz, true)}>
                    Set up outreach
                  </Button>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

export function SettingsScreen() {
  const [businesses, setBusinesses] = useState<Biz[]>([]);
  /** Per-business draft for Umami id (portfolio table edits). */
  const [umamiDraft, setUmamiDraft] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    name: "",
    type: "local_service",
    target_audience: "",
    industry: "",
    website_url: "",
    goals: "",
    umami_website_id: "",
    stripe_secret_key: "",
  });

  const load = async () => {
    const res = await fetch("/api/businesses");
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const msg =
        typeof data?.error === "string"
          ? data.hint
            ? `${data.error} — ${data.hint}`
            : data.error
          : "Could not load businesses";
      toast.error(msg);
      return;
    }
    setBusinesses(await res.json());
  };

  useEffect(() => {
    load();
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/businesses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        type: form.type,
        target_audience: form.target_audience || undefined,
        industry: form.industry || undefined,
        website_url: form.website_url || undefined,
        goals: form.goals || undefined,
        umami_website_id: form.umami_website_id || undefined,
        stripe_secret_key: form.stripe_secret_key || undefined,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const msg =
        typeof data?.error === "string"
          ? data.error
          : data?.error?.fieldErrors?.website_url?.[0] ??
            data?.error?.formErrors?.[0] ??
            JSON.stringify(data?.error ?? data);
      toast.error(msg || "Could not create business");
      return;
    }
    toast.success("Business added");
    setForm({
      name: "",
      type: "local_service",
      target_audience: "",
      industry: "",
      website_url: "",
      goals: "",
      umami_website_id: "",
      stripe_secret_key: "",
    });
    load();
  };

  const toggleActive = async (biz: Biz, active: boolean) => {
    const res = await fetch("/api/businesses", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: biz.id, active }),
    });
    if (!res.ok) {
      toast.error("Update failed");
      return;
    }
    toast.success("Saved");
    load();
  };

  const saveUmamiWebsiteId = async (biz: Biz) => {
    const raw =
      biz.id in umamiDraft ?
        umamiDraft[biz.id]
      : (biz.umami_website_id ?? "");
    const trimmed = raw.trim();
    const payload: { id: string; umami_website_id?: string | null } = { id: biz.id };
    payload.umami_website_id =
      trimmed ? trimmed : null;

    const res = await fetch("/api/businesses", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const msg =
        typeof data?.error === "string" ? data.error : data?.hint ?? "Could not save Umami ID";
      toast.error(String(msg));
      return;
    }
    toast.success("Umami website id saved");
    setUmamiDraft((d) => {
      const next = { ...d };
      delete next[biz.id];
      return next;
    });
    load();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add business</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-2" onSubmit={create}>
            <div className="space-y-2 md:col-span-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={form.type}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    type: (typeof v === "string" ? v : f.type) as Biz["type"],
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="local_service">Local service</SelectItem>
                  <SelectItem value="b2b_saas">B2B SaaS</SelectItem>
                  <SelectItem value="agency">Agency</SelectItem>
                  <SelectItem value="ecommerce">E-commerce</SelectItem>
                  <SelectItem value="generic">Generic</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Website</Label>
              <Input value={form.website_url} onChange={(e) => setForm((f) => ({ ...f, website_url: e.target.value }))} placeholder="https://" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Target audience</Label>
              <Textarea value={form.target_audience} onChange={(e) => setForm((f) => ({ ...f, target_audience: e.target.value }))} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Industry</Label>
              <Input value={form.industry} onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Goals</Label>
              <Textarea value={form.goals} onChange={(e) => setForm((f) => ({ ...f, goals: e.target.value }))} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Umami website id</Label>
              <Input value={form.umami_website_id} onChange={(e) => setForm((f) => ({ ...f, umami_website_id: e.target.value }))} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Stripe secret key (encrypted)</Label>
              <Input
                type="password"
                autoComplete="off"
                value={form.stripe_secret_key}
                onChange={(e) => setForm((f) => ({ ...f, stripe_secret_key: e.target.value }))}
              />
            </div>
            <Button type="submit" className="md:col-span-2 h-12">
              Save business
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active portfolio</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Umami website id</TableHead>
                <TableHead>Stripe</TableHead>
                <TableHead className="text-right">Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {businesses.map((biz) => (
                <TableRow key={biz.id}>
                  <TableCell className="font-medium">{biz.name}</TableCell>
                  <TableCell>{biz.type}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <Input
                        aria-label={`Umami id for ${biz.name}`}
                        className="h-9 min-w-[12rem] font-mono text-xs"
                        placeholder="Umami dashboard → Websites → Website ID"
                        value={biz.id in umamiDraft ? umamiDraft[biz.id] : (biz.umami_website_id ?? "")}
                        onChange={(e) =>
                          setUmamiDraft((d) => ({
                            ...d,
                            [biz.id]: e.target.value,
                          }))
                        }
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-9 shrink-0"
                        onClick={() => void saveUmamiWebsiteId(biz)}
                      >
                        Save
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>{biz.has_stripe ? "Vaulted" : "—"}</TableCell>
                  <TableCell className="text-right">
                    <Switch checked={biz.active} onCheckedChange={(v) => toggleActive(biz, v)} aria-label={`Toggle ${biz.name}`} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <OutreachPortfolioCard businesses={businesses} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Environment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Set `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_ENCRYPTION_KEY`, and `NEXT_PUBLIC_UMAMI_URL` in Vercel.</p>
          <p>Umami deploys as a separate Vercel project — point the URL here for script tags + server pulls.</p>
        </CardContent>
      </Card>
    </div>
  );
}
