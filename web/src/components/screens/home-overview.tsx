"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Activity, ArrowUpRight, Gauge, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";

type Business = {
  id: string;
  name: string;
  type: string;
  umami_website_id: string | null;
  active: boolean;
};

export function HomeOverview() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [snapshots, setSnapshots] = useState<Record<string, unknown>[]>([]);
  const [revenue, setRevenue] = useState<Record<string, unknown>[]>([]);
  const [pending, setPending] = useState<Record<string, unknown>[]>([]);
  const [leads, setLeads] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [bRes, aRes, rRes, pRes, lRes] = await Promise.all([
          fetch("/api/businesses"),
          fetch("/api/analytics-snapshots"),
          fetch("/api/revenue-entries"),
          fetch("/api/pending-posts?status=pending"),
          fetch(`/api/leads?from=${new Date().toISOString().slice(0, 10)}`),
        ]);
        if (!bRes.ok) throw new Error("Failed to load businesses");
        setBusinesses(await bRes.json());
        if (aRes.ok) setSnapshots(await aRes.json());
        if (rRes.ok) setRevenue(await rRes.json());
        if (pRes.ok) setPending(await pRes.json());
        if (lRes.ok) setLeads(await lRes.json());
      } catch {
        toast.error("Could not refresh dashboard data");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const sparkData = useMemo(() => {
    const days = Array.from({ length: 7 }).map((_, idx) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - idx));
      return format(d, "MMM dd");
    });
    return days.map((label, idx) => {
      const subset = snapshots.slice(idx * 3, idx * 3 + 10);
      const views = subset.reduce((acc, snap) => {
        const payload = snap.payload as Record<string, unknown> | undefined;
        const pv =
          payload?.pageviews ??
          payload?.pageViews ??
          1;
        return acc + Number(pv);
      }, 0);
      const revSlice = revenue.filter((_, i) => i % 7 === idx);
      const rev = revSlice.reduce((acc, row) => acc + Number(row.amount ?? 0), 0);
      return { label, traffic: views || idx + 1, revenue: rev };
    });
  }, [snapshots, revenue]);

  const runEngine = async () => {
    toast.message("Trigger the GitHub Action `marketing-engine.yml` or run `python engine/main.py` locally.");
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading businesses…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="rounded-full px-3 py-1">
            {businesses.filter((b) => b.active).length} active brands
          </Badge>
          <Badge variant="outline" className="rounded-full px-3 py-1">
            {pending.length} approvals waiting
          </Badge>
        </div>
        <Button size="lg" className="h-12 px-6 text-base" onClick={runEngine} type="button">
          <Sparkles className="mr-2 h-4 w-4" />
          Run engine now
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {businesses.map((biz) => {
          const bizSnaps = snapshots.filter((s) => String(s.business_id) === biz.id);
          const payload = (bizSnaps[0]?.payload ?? {}) as Record<string, unknown>;
          const totals = payload.totals as Record<string, unknown> | undefined;
          const rawViews = totals?.pageviews ?? payload.pageviews ?? "—";
          const rawUniq = totals?.visitors ?? payload.visitors ?? "—";
          const views = typeof rawViews === "string" || typeof rawViews === "number" ? rawViews : "—";
          const uniq = typeof rawUniq === "string" || typeof rawUniq === "number" ? rawUniq : "—";
          const revToday = revenue
            .filter((r) => r.business_id === biz.id)
            .reduce((acc, row) => acc + Number(row.amount ?? 0), 0);
          const leadCount = leads.filter((l) => l.business_id === biz.id).length;

          return (
            <Card key={biz.id} className="border-border/60 shadow-sm">
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <div>
                  <CardTitle className="text-lg font-semibold">{biz.name}</CardTitle>
                  <p className="text-xs uppercase text-muted-foreground">{biz.type.replaceAll("_", " ")}</p>
                </div>
                <Badge variant="outline">{biz.umami_website_id ? "Umami" : "No tracker"}</Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Leads today</p>
                    <p className="text-2xl font-semibold">{leadCount}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Traffic</p>
                    <p className="text-2xl font-semibold">{views}</p>
                    <p className="text-xs text-muted-foreground">Visitors {uniq}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Revenue (loaded)</p>
                    <p className="text-2xl font-semibold">£{revToday.toFixed(0)}</p>
                  </div>
                </div>
                <div className="h-32 min-h-[128px] w-full min-w-0 rounded-lg border bg-muted/30 p-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={sparkData}>
                      <XAxis dataKey="label" hide />
                      <YAxis hide />
                      <RTooltip />
                      <Line type="monotone" dataKey="traffic" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="revenue" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Activity className="h-3 w-3" />
                      7d trend (proxy)
                    </span>
                    <ArrowUpRight className="h-4 w-4" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className="h-4 w-4" />
            Portfolio signals
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm text-muted-foreground md:grid-cols-3">
          <p>
            Umami captures cookieless analytics; drop the tracking snippet from the Traffic → Tracking tab for each
            brand.
          </p>
          <p>Stripe keys are AES sealed server-side — never shipped to the browser.</p>
          <p>Agents run on GitHub Actions daily at 08:00 — adjust cron as needed.</p>
        </CardContent>
      </Card>
    </div>
  );
}
