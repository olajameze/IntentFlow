"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, CloudSync, ExternalLink, Globe, LineChart as LineIcon, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  chartTooltipContentStyle,
  chartTooltipItemStyle,
  chartTooltipLabelStyle,
} from "@/lib/chart-tooltip";
import { useChartSvgColors } from "@/lib/use-chart-svg-colors";
import { claritySessionsFromPayload } from "@/lib/clarity-payload";
import {
  chartSnapshotsForBusiness,
  filterSnapshotsForBusiness,
  formatSnapshotLabel,
  totalsFromLatestSnapshots,
} from "@/lib/analytics-snapshots";
import { cn } from "@/lib/utils";
import {
  clarityDashboardUrl,
  clarityProjectsHomeUrl,
  clarityTrackingSnippet,
} from "@/lib/clarity";

function githubTrafficWorkflowUrl(): string | null {
  const slug = process.env.NEXT_PUBLIC_GITHUB_REPO?.trim();
  if (!slug?.includes("/")) return null;
  return `https://github.com/${slug}/actions/workflows/traffic-revenue-sync.yml`;
}

export function TrafficScreen() {
  const svg = useChartSvgColors();
  const [businesses, setBusinesses] = useState<Record<string, unknown>[]>([]);
  const [snapshots, setSnapshots] = useState<Record<string, unknown>[]>([]);
  const [selected, setSelected] = useState<string>("all");
  const [trafficSyncDispatching, setTrafficSyncDispatching] = useState(false);
  const [claritySyncing, setClaritySyncing] = useState(false);
  const [clarityHealth, setClarityHealth] = useState<{
    configured: boolean;
    keyValid: boolean;
    keyMessage?: string;
    windowDays?: number;
  } | null>(null);

  async function reloadSnapshots() {
    const s = await fetch("/api/analytics-snapshots");
    if (s.ok) setSnapshots(await s.json());
  }

  useEffect(() => {
    async function load() {
      const [b, s] = await Promise.all([fetch("/api/businesses"), fetch("/api/analytics-snapshots")]);
      if (b.ok) setBusinesses(await b.json());
      if (s.ok) setSnapshots(await s.json());
    }
    load();
  }, []);

  useEffect(() => {
    fetch("/api/clarity-sync")
      .then((r) => r.json())
      .then((data: Record<string, unknown>) => {
        setClarityHealth({
          configured: Boolean(data.configured),
          keyValid: Boolean(data.keyValid),
          keyMessage: typeof data.keyMessage === "string" ? data.keyMessage : undefined,
          windowDays: typeof data.windowDays === "number" ? data.windowDays : undefined,
        });
      })
      .catch(() => setClarityHealth(null));
  }, [claritySyncing, snapshots.length]);

  const runClaritySync = async () => {
    setClaritySyncing(true);
    try {
      const res = await fetch("/api/clarity-sync", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.ok && data.ok) {
        await reloadSnapshots();
        toast.success(
          `Clarity synced — ${String(data.synced ?? 0)} business(es), last ${String(data.windowDays ?? 3)} day(s).`,
          { duration: 8000 },
        );
        return;
      }
      const results = Array.isArray(data.results) ? data.results : [];
      const failed = results.filter((r) => r && typeof r === "object" && (r as { ok?: boolean }).ok === false);
      const firstDetail =
        failed[0] && typeof failed[0] === "object" ?
          String((failed[0] as { detail?: string }).detail ?? "")
        : "";
      const msg = typeof data.error === "string" ? data.error : `HTTP ${res.status}`;
      const hint = typeof data.hint === "string" ? data.hint : firstDetail || "";
      toast.error(hint ? `${msg}\n\n${hint}` : msg, { duration: 15_000 });
    } catch {
      toast.error("Could not reach /api/clarity-sync");
    } finally {
      setClaritySyncing(false);
    }
  };

  const runTrafficGithubSync = async () => {
    setTrafficSyncDispatching(true);
    try {
      const res = await fetch("/api/trigger-traffic-sync", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

      const manualUrl =
        typeof data.manualUrl === "string" ? data.manualUrl : githubTrafficWorkflowUrl();
      const logsUrl = typeof data.logsUrl === "string" ? data.logsUrl : manualUrl;

      if (res.ok && data.ok) {
        toast.success(String(data.message ?? "Traffic sync workflow dispatched."), {
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
      const openWorkflowUrl = typeof data.manualUrl === "string" ? data.manualUrl : githubTrafficWorkflowUrl();
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
      toast.error("Could not reach /api/trigger-traffic-sync");
    } finally {
      setTrafficSyncDispatching(false);
    }
  };

  const totals = useMemo(() => totalsFromLatestSnapshots(snapshots, selected), [snapshots, selected]);

  const filteredSnaps = useMemo(
    () => filterSnapshotsForBusiness(snapshots, selected),
    [snapshots, selected],
  );

  const chartData = useMemo(() => {
    return chartSnapshotsForBusiness(snapshots, selected, 14).map((snap) => ({
      label: formatSnapshotLabel(String(snap.captured_at ?? "")),
      value: claritySessionsFromPayload(snap.payload),
    }));
  }, [snapshots, selected]);

  const portfolioLabel = useMemo(() => {
    if (selected === "all") return "All businesses";
    const b = businesses.find((row) => String(row.id).toLowerCase() === selected.toLowerCase());
    return b?.name ? String(b.name) : "Selected business";
  }, [businesses, selected]);

  const activeBusiness = businesses.find(
    (b) => String(b.id).toLowerCase() === selected.toLowerCase(),
  );
  const clarityBusiness =
    selected === "all"
      ? businesses.find((b) => String(b.clarity_project_id ?? "").trim())
      : activeBusiness;
  const clarityProjectId = String(clarityBusiness?.clarity_project_id ?? "").trim();
  const claritySnippet = clarityTrackingSnippet(clarityProjectId);
  const clarityLiveUrl =
    clarityDashboardUrl(clarityProjectId) ?? clarityProjectsHomeUrl();

  const windowLabel = `${totals.windowDays}d`;

  return (
    <Tabs defaultValue="overview" className="min-w-0">
      <TabsList className="grid w-full grid-cols-3 md:w-auto md:inline-flex">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="live">Live view</TabsTrigger>
        <TabsTrigger value="tracking">Tracking code</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="min-w-0 space-y-4">
        {clarityHealth && !clarityHealth.configured ? (
          <Card className="border-amber-500/40 bg-amber-500/5">
            <CardHeader>
              <CardTitle className="text-base">Clarity API token required for sync</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                Save a Clarity Data Export token for each brand in{" "}
                <strong>Settings → Active portfolio → Clarity API token</strong> (one token per Clarity project).
                Optional fallback: <code className="rounded bg-muted px-1">CLARITY_API_TOKEN</code> in{" "}
                <code className="rounded bg-muted px-1">web/.env.local</code>.
              </p>
            </CardContent>
          </Card>
        ) : null}

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <label htmlFor="traffic-portfolio-filter" className="text-sm text-muted-foreground">
              Filter portfolio
            </label>
            <div className="relative mt-1 w-full md:w-72">
              <select
                id="traffic-portfolio-filter"
                className={cn(
                  "h-10 w-full appearance-none rounded-lg border border-input bg-background py-2 pr-10 pl-3 text-sm shadow-sm",
                  "outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40",
                  "dark:bg-input/30",
                )}
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                aria-label="Filter portfolio by business"
              >
                <option value="all">All businesses</option>
                {businesses.map((b) => {
                  const id = String(b.id ?? "");
                  if (!id) return null;
                  return (
                    <option key={id} value={id}>
                      {String(b.name ?? "Business")}
                    </option>
                  );
                })}
              </select>
              <ChevronDown
                className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Latest Clarity window ({windowLabel}):{" "}
              <span className="font-medium text-foreground">{portfolioLabel}</span>
              {totals.lastSyncedAt ?
                <> · last synced {formatSnapshotLabel(totals.lastSyncedAt)}</>
              : null}
            </p>
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <Globe className="h-4 w-4" />
              Free · heatmaps & replays
            </span>
            <Button
              type="button"
              variant="outline"
              className="h-10 shrink-0"
              onClick={() => window.open(clarityLiveUrl, "_blank", "noopener,noreferrer")}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Open Clarity
            </Button>
            <Button
              type="button"
              variant="default"
              className="h-10 shrink-0"
              onClick={runClaritySync}
              disabled={claritySyncing || clarityHealth?.configured === false}
            >
              {claritySyncing ?
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : <RefreshCw className="mr-2 h-4 w-4" />}
              {claritySyncing ? "Syncing Clarity…" : "Sync now"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="h-10 shrink-0"
              onClick={runTrafficGithubSync}
              disabled={trafficSyncDispatching}
            >
              {trafficSyncDispatching ?
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : <CloudSync className="mr-2 h-4 w-4" />}
              {trafficSyncDispatching ? "Dispatching…" : "GitHub: sync traffic"}
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sessions (latest sync)</CardTitle>
              <p className="text-xs text-muted-foreground">Clarity window · {windowLabel} · {portfolioLabel}</p>
            </CardHeader>
            <CardContent className="text-3xl font-semibold">{totals.sessions}</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Users (latest sync)</CardTitle>
              <p className="text-xs text-muted-foreground">Distinct users · {windowLabel}</p>
            </CardHeader>
            <CardContent className="text-3xl font-semibold">{totals.users || "—"}</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Data source</CardTitle>
              <p className="text-xs text-muted-foreground">{portfolioLabel}</p>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Microsoft Clarity Data Export API →{" "}
              <code className="rounded bg-muted px-1">analytics_snapshots</code>. Max 3-day lookback, 10 requests/project/day.
            </CardContent>
          </Card>
        </div>

        {filteredSnaps.length === 0 ? (
          <Card className="border-amber-500/40 bg-amber-500/5">
            <CardHeader>
              <CardTitle className="text-base">No traffic snapshots yet</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                Add a Clarity project ID and API token in Settings (one token per project from Clarity → Data Export),
                then click <strong>Sync now</strong> or run{" "}
                <code className="rounded bg-muted px-1">cd engine &amp;&amp; python main.py traffic</code>.
              </p>
            </CardContent>
          </Card>
        ) : null}

        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <LineIcon className="h-4 w-4" />
                Snapshot pulse
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">{portfolioLabel}</p>
            </div>
            <span className="text-xs text-muted-foreground">Sessions per sync</span>
          </CardHeader>
          <CardContent className="min-w-0">
            <ResponsiveContainer width="100%" height={256}>
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid stroke={svg.border} strokeDasharray="3 3" vertical={false} opacity={0.45} />
                <XAxis dataKey="label" tick={svg.axisTick} tickLine={false} axisLine={{ stroke: svg.border }} />
                <YAxis tick={svg.axisTick} tickLine={false} axisLine={{ stroke: svg.border }} width={36} />
                <Tooltip
                  contentStyle={chartTooltipContentStyle}
                  labelStyle={chartTooltipLabelStyle}
                  itemStyle={chartTooltipItemStyle}
                  cursor={{ stroke: svg.primary, strokeWidth: 1, strokeDasharray: "4 4" }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  name="Sessions"
                  stroke={svg.chart1}
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: svg.chart1, stroke: svg.card, strokeWidth: 2 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Similarweb intelligence</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              Competitive estimates run through the Python `scrape_similarweb_traffic` tool (Playwright). Execute on your
              worker or GitHub Action to avoid heavy browsers on Vercel edge functions.
            </p>
            <div className="grid gap-2 md:grid-cols-[2fr_1fr]">
              <Textarea
                placeholder="example.com"
                className="min-h-[96px]"
                disabled
                readOnly
                value="Local: npm run engine:traffic (from web/) or cd ../engine && python main.py traffic"
              />
              <Button type="button" variant="secondary" className="h-12" disabled>
                Run scraper on serverless (disabled)
              </Button>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="live" className="min-w-0 space-y-4">
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-base">Microsoft Clarity dashboard</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Clarity is free with unlimited traffic, heatmaps, and session replay. Add your project ID in{" "}
              <strong>Settings → Active portfolio → Clarity project ID</strong>, paste the tracking snippet on each site
              (Tracking tab), then open your dashboard here.
            </p>
            <Button
              type="button"
              variant="default"
              onClick={() => window.open(clarityLiveUrl, "_blank", "noopener,noreferrer")}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              {clarityProjectId ? "Open Clarity dashboard" : "Open Clarity projects"}
            </Button>
            {!clarityProjectId ? (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                No Clarity project ID saved yet for {portfolioLabel}. Add one in Settings first.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="tracking" className="min-w-0 space-y-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Microsoft Clarity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Paste inside <code className="rounded bg-muted px-1">{`<head>`}</code> or before{" "}
              <code className="rounded bg-muted px-1">{`</body>`}</code> on{" "}
              <span className="font-medium text-foreground">{portfolioLabel}</span>.
            </p>
            <Textarea readOnly value={claritySnippet} className="min-h-[140px] font-mono text-xs" />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => navigator.clipboard.writeText(claritySnippet)}
                variant="secondary"
                className="h-11"
                disabled={!clarityProjectId}
              >
                Copy Clarity snippet
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11"
                onClick={() => window.open(clarityLiveUrl, "_blank", "noopener,noreferrer")}
              >
                Open Clarity dashboard
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base">Sync history</CardTitle>
            <p className="text-xs text-muted-foreground">{portfolioLabel}</p>
          </CardHeader>
          <CardContent className="min-w-0">
            <ResponsiveContainer width="100%" height={224}>
              <BarChart data={chartData} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
                <CartesianGrid stroke={svg.border} strokeDasharray="3 3" vertical={false} opacity={0.45} />
                <XAxis dataKey="label" hide />
                <YAxis hide />
                <Tooltip
                  contentStyle={chartTooltipContentStyle}
                  labelStyle={chartTooltipLabelStyle}
                  itemStyle={chartTooltipItemStyle}
                  cursor={{ fill: svg.muted }}
                />
                <Bar dataKey="value" name="Sessions" fill={svg.chart2} radius={[6, 6, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
