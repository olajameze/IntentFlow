"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, CloudSync, ExternalLink, Globe, LineChart as LineIcon, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import {
  chartSnapshotsForBusiness,
  filterSnapshotsForBusiness,
  formatSnapshotLabel,
  totalsFromLatestSnapshots,
} from "@/lib/analytics-snapshots";
import { cn } from "@/lib/utils";
import { umamiCloudPortfolioUrl, umamiCloudWebsiteUrl } from "@/lib/umami-dashboard-url";
import { normalizeUmamiShareUrl } from "@/lib/umami-share-url";
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
  const [umamiSyncing, setUmamiSyncing] = useState(false);
  const [umamiHealth, setUmamiHealth] = useState<{
    keyValid: boolean;
    keyMessage?: string;
    websiteCount?: number;
    hint?: string;
  } | null>(null);
  const [shareDraft, setShareDraft] = useState("");
  const [shareSaving, setShareSaving] = useState(false);

  async function reloadBusinesses() {
    const b = await fetch("/api/businesses");
    if (b.ok) setBusinesses(await b.json());
  }

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
    fetch("/api/umami-sync")
      .then((r) => r.json())
      .then((data: Record<string, unknown>) => {
        setUmamiHealth({
          keyValid: Boolean(data.keyValid),
          keyMessage: typeof data.keyMessage === "string" ? data.keyMessage : undefined,
          websiteCount: typeof data.websiteCount === "number" ? data.websiteCount : undefined,
          hint: typeof data.hint === "string" ? data.hint : undefined,
        });
      })
      .catch(() => setUmamiHealth(null));
  }, [umamiSyncing, snapshots.length]);

  const runUmamiSync = async () => {
    setUmamiSyncing(true);
    try {
      const res = await fetch("/api/umami-sync", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.ok && data.ok) {
        await reloadSnapshots();
        toast.success(
          `Umami synced — ${String(data.synced ?? 0)} business(es), last ${String(data.windowDays ?? 30)} days.`,
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
      const hint =
        typeof data.hint === "string" ? data.hint
        : firstDetail.includes("401") ?
          "Regenerate your Umami Cloud API key (Settings → API keys) and update UMAMI_API_TOKEN."
        : firstDetail || "";
      toast.error(hint ? `${msg}\n\n${hint}` : msg, { duration: 15_000 });
    } catch {
      toast.error("Could not reach /api/umami-sync");
    } finally {
      setUmamiSyncing(false);
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

  const totals = useMemo(() => {
    return totalsFromLatestSnapshots(snapshots, selected);
  }, [snapshots, selected]);

  const filteredSnaps = useMemo(
    () => filterSnapshotsForBusiness(snapshots, selected),
    [snapshots, selected],
  );

  const chartData = useMemo(() => {
    return chartSnapshotsForBusiness(snapshots, selected, 14).map((snap) => ({
      label: formatSnapshotLabel(String(snap.captured_at ?? "")),
      value: umamiPageviewsFromPayload(snap.payload),
    }));
  }, [snapshots, selected]);

  const portfolioLabel = useMemo(() => {
    if (selected === "all") return "All businesses";
    const b = businesses.find((row) => String(row.id).toLowerCase() === selected.toLowerCase());
    return b?.name ? String(b.name) : "Selected business";
  }, [businesses, selected]);

  const umamiBase = process.env.NEXT_PUBLIC_UMAMI_URL ?? "https://your-umami.vercel.app";
  const activeBusiness = businesses.find(
    (b) => String(b.id).toLowerCase() === selected.toLowerCase(),
  );
  const selectedBusinessId =
    selected === "all" ? String(businesses[0]?.id ?? "") : selected;
  const shareBusiness =
    selected === "all"
      ? businesses.find((b) => String(b.umami_share_url ?? "").trim())
      : activeBusiness;
  const activeShareUrl = normalizeUmamiShareUrl(
    String(shareBusiness?.umami_share_url ?? ""),
  );

  useEffect(() => {
    const stored = String(shareBusiness?.umami_share_url ?? "");
    setShareDraft(stored);
  }, [shareBusiness?.id, shareBusiness?.umami_share_url]);

  const saveShareUrl = async () => {
    const bizId = String(shareBusiness?.id ?? selectedBusinessId);
    if (!bizId) {
      toast.error("Select a business first");
      return;
    }
    setShareSaving(true);
    try {
      const res = await fetch("/api/businesses", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: bizId,
          umami_share_url: shareDraft.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Could not save share URL");
        return;
      }
      toast.success("Share URL saved — live view updated");
      await reloadBusinesses();
    } finally {
      setShareSaving(false);
    }
  };

  const websiteId =
    selected === "all"
      ? businesses[0]?.umami_website_id
      : activeBusiness?.umami_website_id;

  const liveUmamiUrl =
    selected === "all"
      ? umamiCloudPortfolioUrl()
      : umamiCloudWebsiteUrl(String(websiteId ?? "")) ?? umamiCloudPortfolioUrl();

  const clarityBusiness =
    selected === "all"
      ? businesses.find((b) => String(b.clarity_project_id ?? "").trim())
      : activeBusiness;
  const clarityProjectId = String(clarityBusiness?.clarity_project_id ?? "").trim();
  const claritySnippet = clarityTrackingSnippet(clarityProjectId);
  const clarityLiveUrl =
    clarityDashboardUrl(clarityProjectId) ?? clarityProjectsHomeUrl();

  const snippet = `<script async src="${umamiBase}/script.js" data-website-id="${websiteId ? String(websiteId) : "YOUR_WEBSITE_ID"}"></script>`;

  return (
    <Tabs defaultValue="overview" className="min-w-0">
      <TabsList className="grid w-full grid-cols-3 md:w-auto md:inline-flex">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="live">Live view</TabsTrigger>
        <TabsTrigger value="tracking">Tracking code</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="min-w-0 space-y-4">
        {umamiHealth && !umamiHealth.keyValid ? (
          <Card className="border-amber-500/40 bg-amber-500/5">
            <CardHeader>
              <CardTitle className="text-base">Auto-sync needs a paid Umami API key</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                IntentFlow pulls traffic into the dashboard via the Umami Cloud API. On the free Hobby plan, Umami often
                asks you to upgrade before you can create an API key — and the key in{" "}
                <code className="rounded bg-muted px-1">.env.local</code> is being rejected (
                <strong className="text-foreground">{umamiHealth.keyMessage ?? "Unauthorized"}</strong>).
              </p>
              <p>
                <strong className="text-foreground">Your sites still collect data</strong> in Umami Cloud. Use the{" "}
                <strong>Live view</strong> tab (Share URL embed, free) or <strong>Open live Umami</strong> below. Snapshot
                charts here stay stale until API access is available.
              </p>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  <strong>Free:</strong> open the Umami dashboard (button below) — same numbers as{" "}
                  <a
                    href="https://cloud.umami.is/analytics/eu/dashboard"
                    className="text-primary underline-offset-4 hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    cloud.umami.is
                  </a>
                </li>
                <li>
                  <strong>~$9/mo:</strong> Umami Cloud Basic — unlocks API keys for automatic Sync now
                </li>
                <li>
                  <strong>$0:</strong> self-host Umami (MIT license) — full API with username/password; see README
                </li>
              </ul>
            </CardContent>
          </Card>
        ) : null}

        {umamiHealth?.keyValid ? (
          <Card className="border-emerald-500/30 bg-emerald-500/5">
            <CardContent className="py-3 text-sm text-muted-foreground">
              Umami Cloud connected — {umamiHealth.websiteCount ?? 0} website(s) visible to this API key.
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
              Latest Umami window (30d):{" "}
              <span className="font-medium text-foreground">{portfolioLabel}</span>
              {totals.lastSyncedAt ?
                <> · last synced {formatSnapshotLabel(totals.lastSyncedAt)}</>
              : null}
            </p>
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <Globe className="h-4 w-4" />
              GDPR-friendly · no cookies
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
              variant="outline"
              className="h-10 shrink-0"
              onClick={() => window.open(liveUmamiUrl, "_blank", "noopener,noreferrer")}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Open Umami
            </Button>
            <Button
              type="button"
              variant="default"
              className="h-10 shrink-0"
              onClick={runUmamiSync}
              disabled={umamiSyncing || umamiHealth?.keyValid === false}
              title={
                umamiHealth?.keyValid === false ?
                  "Requires a valid Umami Cloud API key (paid plan or self-hosted)"
                : undefined
              }
            >
              {umamiSyncing ?
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : <RefreshCw className="mr-2 h-4 w-4" />}
              {umamiSyncing ? "Syncing Umami…" : "Sync now"}
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
              <CardTitle className="text-base">Pageviews (latest sync)</CardTitle>
              <p className="text-xs text-muted-foreground">Rolling 30-day window · {portfolioLabel}</p>
            </CardHeader>
            <CardContent className="text-3xl font-semibold">{totals.pageviews}</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Visitors (latest sync)</CardTitle>
              <p className="text-xs text-muted-foreground">Rolling 30-day window · {portfolioLabel}</p>
            </CardHeader>
            <CardContent className="text-3xl font-semibold">{totals.visitors || "—"}</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Data source</CardTitle>
              <p className="text-xs text-muted-foreground">{portfolioLabel}</p>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Live Umami Cloud (EU) → <code className="rounded bg-muted px-1">analytics_snapshots</code>. Use{" "}
              <strong>Sync now</strong> or run <code className="rounded bg-muted px-1">python main.py traffic</code>.
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
                No Umami snapshots for this filter yet. Click <strong>Sync now</strong> above (requires{" "}
                <code className="rounded bg-muted px-1">UMAMI_API_TOKEN</code>,{" "}
                <code className="rounded bg-muted px-1">UMAMI_URL</code>, and{" "}
                <code className="rounded bg-muted px-1">UMAMI_CLOUD_REGION=eu</code> in{" "}
                <code className="rounded bg-muted px-1">web/.env.local</code>), or run{" "}
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

      <TabsContent value="live" className="min-w-0 space-y-4">
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-base">Microsoft Clarity (your choice)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Clarity is free with unlimited traffic, heatmaps, and session replay. Add your project ID in{" "}
              <strong>Settings → Active portfolio → Clarity project ID</strong>, paste the tracking snippet on each site
              (Tracking tab), then open your dashboard here.
            </p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                Sign up at{" "}
                <a
                  href="https://clarity.microsoft.com/"
                  className="text-primary underline-offset-4 hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  clarity.microsoft.com
                </a>{" "}
                (Microsoft account)
              </li>
              <li>Add a project per website → copy the <strong>Project ID</strong> from Setup</li>
              <li>Save it in Settings, then use <strong>Tracking code → Microsoft Clarity</strong></li>
            </ol>
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Umami Share URL (optional embed)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Optional: embed Umami stats if you created a Share URL on the free Hobby plan (separate from Clarity).
            </p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Umami → select a website → <strong>Edit</strong></li>
              <li>Scroll to <strong>Share URL</strong> → create / copy link</li>
              <li>Paste below and click Save (or save in Settings → Active portfolio)</li>
            </ol>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                className="font-mono text-xs"
                placeholder="https://cloud.umami.is/share/…"
                value={shareDraft}
                onChange={(e) => setShareDraft(e.target.value)}
                aria-label="Umami share URL"
              />
              <Button type="button" className="shrink-0" disabled={shareSaving} onClick={() => void saveShareUrl()}>
                {shareSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save share URL
              </Button>
            </div>
            {selected === "all" && !shareBusiness ? (
              <p className="text-amber-700 dark:text-amber-400">
                Filter to one business, or add a share URL for at least one brand in Settings.
              </p>
            ) : null}
          </CardContent>
        </Card>

        {activeShareUrl ? (
          <Card className="overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">
                  {String(shareBusiness?.name ?? portfolioLabel)}
                </CardTitle>
                <p className="text-xs text-muted-foreground">Embedded from Umami Share URL</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => window.open(activeShareUrl, "_blank", "noopener,noreferrer")}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Open in tab
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <iframe
                src={activeShareUrl}
                title={`Live Umami analytics — ${String(shareBusiness?.name ?? "business")}`}
                className="h-[min(720px,75vh)] w-full border-0 bg-background"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </CardContent>
          </Card>
        ) : (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Paste a Share URL above to embed live traffic here.
            </CardContent>
          </Card>
        )}

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
              <span className="font-medium text-foreground">{portfolioLabel}</span>. Project ID from{" "}
              <a
                href="https://clarity.microsoft.com/"
                className="text-primary underline-offset-4 hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Clarity → Setup
              </a>
              , saved in Settings.
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Umami (optional)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Optional cookieless tracker — paste before <code className="rounded bg-muted px-1">{`</body>`}</code> if you
              still use Umami alongside Clarity.
            </p>
            <Textarea readOnly value={snippet} className="min-h-[120px] font-mono text-xs" />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => navigator.clipboard.writeText(snippet)}
                variant="secondary"
                className="h-11"
              >
                Copy Umami snippet
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
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
