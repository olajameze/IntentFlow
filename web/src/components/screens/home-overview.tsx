"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Activity, ArrowUpRight, Gauge, Loader2, Sparkles } from "lucide-react";
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
import { umamiPageviewsFromPayload, umamiVisitorsFromPayload } from "@/lib/umami-payload";

type Business = {
  id: string;
  name: string;
  type: string;
  umami_website_id: string | null;
  active: boolean;
};

/** Client-side Actions URL when `NEXT_PUBLIC_GITHUB_REPO` is set (token may still be missing). */
function githubMarketingWorkflowUrl(): string | null {
  const slug = process.env.NEXT_PUBLIC_GITHUB_REPO?.trim();
  if (!slug?.includes("/")) return null;
  return `https://github.com/${slug}/actions/workflows/marketing-engine.yml`;
}

async function formatApiFailure(res: Response): Promise<string> {
  const data = await res.json().catch(() => ({} as Record<string, unknown>));
  const err = typeof data.error === "string" ? data.error : "";
  const hint = typeof data.hint === "string" ? data.hint : "";
  if (err && hint) return `${err} — ${hint}`;
  if (err) return err;
  if (hint) return hint;
  return `HTTP ${res.status}`;
}

export function HomeOverview() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [snapshots, setSnapshots] = useState<Record<string, unknown>[]>([]);
  const [revenue, setRevenue] = useState<Record<string, unknown>[]>([]);
  const [pending, setPending] = useState<Record<string, unknown>[]>([]);
  const [leads, setLeads] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [dispatching, setDispatching] = useState(false);

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
        if (!bRes.ok) {
          toast.error(await formatApiFailure(bRes), { duration: 35_000, id: "dashboard-api" });
          return;
        }
        setBusinesses(await bRes.json());

        const parts: string[] = [];
        if (aRes.ok) setSnapshots(await aRes.json());
        else parts.push(`Analytics: ${await formatApiFailure(aRes)}`);
        if (rRes.ok) setRevenue(await rRes.json());
        else parts.push(`Revenue: ${await formatApiFailure(rRes)}`);
        if (pRes.ok) setPending(await pRes.json());
        else parts.push(`Pending posts: ${await formatApiFailure(pRes)}`);
        if (lRes.ok) setLeads(await lRes.json());
        else parts.push(`Leads: ${await formatApiFailure(lRes)}`);

        if (parts.length) {
          toast.error(parts.join("\n\n"), { duration: 35_000, id: "dashboard-api-partial" });
        }
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
      const views = subset.reduce((acc, snap) => acc + umamiPageviewsFromPayload(snap.payload), 0);
      const revSlice = revenue.filter((_, i) => i % 7 === idx);
      const rev = revSlice.reduce((acc, row) => acc + Number(row.amount ?? 0), 0);
      return { label, traffic: views, revenue: rev };
    });
  }, [snapshots, revenue]);

  const runEngine = async () => {
    setDispatching(true);
    try {
      const res = await fetch("/api/trigger-engine", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

      const manualUrl =
        typeof data.manualUrl === "string" ?
          data.manualUrl
        : githubMarketingWorkflowUrl();
      const logsUrl = typeof data.logsUrl === "string" ? data.logsUrl : manualUrl;

      if (res.ok && data.ok) {
        toast.success(String(data.message ?? "Marketing Engine workflow dispatched."), {
          duration: 10_000,
          action:
            logsUrl ?
              {
                label: "Open Actions",
                onClick: () => window.open(logsUrl, "_blank", "noopener,noreferrer"),
              }
            : undefined,
        });
        return;
      }

      const msg = typeof data.error === "string" ? data.error : `HTTP ${res.status}`;
      const hint = typeof data.hint === "string" ? data.hint : "";
      const openWorkflowUrl = typeof data.manualUrl === "string" ? data.manualUrl : githubMarketingWorkflowUrl();
      toast.error(hint ? `${msg}\n\n${hint.slice(0, 280)}` : msg, {
        duration: 20_000,
        ...(openWorkflowUrl ?
          {
            action: {
              label: "Open workflow",
              onClick: () => window.open(openWorkflowUrl, "_blank", "noopener,noreferrer"),
            },
          }
        : {}),
      });
    } catch {
      toast.error("Could not reach /api/trigger-engine");
    } finally {
      setDispatching(false);
    }
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
        <Button
          size="lg"
          className="h-12 px-6 text-base"
          onClick={runEngine}
          type="button"
          disabled={dispatching}
        >
          {dispatching ?
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          : <Sparkles className="mr-2 h-4 w-4" />}
          {dispatching ? "Dispatching…" : "Run engine now"}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {businesses.map((biz) => {
          const bizSnaps = snapshots.filter((s) => String(s.business_id) === biz.id);
          const latestPayload = bizSnaps[0]?.payload;
          const pv = umamiPageviewsFromPayload(latestPayload);
          const uv = umamiVisitorsFromPayload(latestPayload);
          const views = bizSnaps.length ? pv : "—";
          const uniq = bizSnaps.length ? uv : "—";
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
                <div className="w-full min-w-0 rounded-lg border bg-muted/30 p-2">
                  <div className="h-28 w-full min-w-0">
                    <ResponsiveContainer width="100%" height={112}>
                      <LineChart data={sparkData}>
                        <XAxis dataKey="label" hide />
                        <YAxis hide />
                        <RTooltip />
                        <Line type="monotone" dataKey="traffic" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="revenue" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
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
