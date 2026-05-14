"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, CloudSync, Globe, LineChart as LineIcon, Loader2 } from "lucide-react";
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
import { umamiPageviewsFromPayload, umamiVisitorsFromPayload } from "@/lib/umami-payload";
import { cn } from "@/lib/utils";

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

  useEffect(() => {
    async function load() {
      const [b, s] = await Promise.all([fetch("/api/businesses"), fetch("/api/analytics-snapshots")]);
      if (b.ok) setBusinesses(await b.json());
      if (s.ok) setSnapshots(await s.json());
    }
    load();
  }, []);

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

  const filteredSnaps = useMemo(() => {
    if (selected === "all") return snapshots;
    const sel = selected.toLowerCase();
    return snapshots.filter((snap) => {
      const bid = snap.business_id ?? (snap as { businessId?: unknown }).businessId;
      return String(bid ?? "").toLowerCase() === sel;
    });
  }, [snapshots, selected]);

  const portfolioLabel = useMemo(() => {
    if (selected === "all") return "All businesses";
    const b = businesses.find((row) => String(row.id).toLowerCase() === selected.toLowerCase());
    return b?.name ? String(b.name) : "Selected business";
  }, [businesses, selected]);

  const totals = useMemo(() => {
    let pageviews = 0;
    let visitors = 0;
    filteredSnaps.forEach((snap) => {
      pageviews += umamiPageviewsFromPayload(snap.payload);
      visitors += umamiVisitorsFromPayload(snap.payload);
    });
    return { pageviews, visitors };
  }, [filteredSnaps]);

  const chartData = useMemo(() => {
    return filteredSnaps.slice(0, 14).map((snap, idx) => {
      return {
        label: `#${idx + 1}`,
        value: umamiPageviewsFromPayload(snap.payload),
      };
    });
  }, [filteredSnaps]);

  const umamiBase = process.env.NEXT_PUBLIC_UMAMI_URL ?? "https://your-umami.vercel.app";
  const activeBusiness = businesses.find(
    (b) => String(b.id).toLowerCase() === selected.toLowerCase(),
  );
  const websiteId =
    selected === "all"
      ? businesses[0]?.umami_website_id
      : activeBusiness?.umami_website_id;

  const snippet = `<script async src="${umamiBase}/script.js" data-website-id="${websiteId ? String(websiteId) : "YOUR_WEBSITE_ID"}"></script>`;

  return (
    <Tabs defaultValue="overview" className="space-y-4">
      <TabsList className="grid w-full grid-cols-2 md:w-auto md:inline-flex">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="tracking">Tracking code</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="space-y-4">
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
              Charts and totals: <span className="font-medium text-foreground">{portfolioLabel}</span>
            </p>
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <Globe className="h-4 w-4" />
              GDPR-friendly · no cookies
            </span>
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
              <CardTitle className="text-base">Pageviews (snapshots)</CardTitle>
              <p className="text-xs text-muted-foreground">{portfolioLabel}</p>
            </CardHeader>
            <CardContent className="text-3xl font-semibold">{totals.pageviews}</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Visitors (aggregated)</CardTitle>
              <p className="text-xs text-muted-foreground">{portfolioLabel}</p>
            </CardHeader>
            <CardContent className="text-3xl font-semibold">{totals.visitors || "—"}</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Data source</CardTitle>
              <p className="text-xs text-muted-foreground">{portfolioLabel}</p>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Pulled via `TrafficMonitor` → Umami API → `analytics_snapshots`.
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
                Charts read from Supabase <code className="rounded bg-muted px-1">analytics_snapshots</code> (filled by
                the Python engine or GitHub Actions). Ensure <code className="rounded bg-muted px-1">UMAMI_API_TOKEN</code>,{" "}
                <code className="rounded bg-muted px-1">UMAMI_URL</code>, and each business&apos;s{" "}
                <code className="rounded bg-muted px-1">umami_website_id</code> are correct, then run{" "}
                <code className="rounded bg-muted px-1">cd engine &amp;&amp; python main.py traffic</code>.
              </p>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <LineIcon className="h-4 w-4" />
                Snapshot pulse
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">{portfolioLabel}</p>
            </div>
            <span className="text-xs text-muted-foreground">Last payloads</span>
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
                  name="Pageviews"
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

      <TabsContent value="tracking" className="space-y-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Install script</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Paste before <code className="rounded bg-muted px-1">{`</body>`}</code> on each business site. Replace{" "}
              <em>website id</em> inside Umami after you create the site entry.
            </p>
            <Textarea readOnly value={snippet} className="min-h-[120px] font-mono text-xs" />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => navigator.clipboard.writeText(snippet)}
                variant="secondary"
                className="h-11"
              >
                Copy snippet
              </Button>
              <p className="text-xs text-muted-foreground">
                Configure <code className="rounded bg-muted px-1">NEXT_PUBLIC_UMAMI_URL</code> to match the deployed Umami
                project.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Device mix</CardTitle>
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
                <Bar dataKey="value" name="Pageviews" fill={svg.chart2} radius={[6, 6, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
