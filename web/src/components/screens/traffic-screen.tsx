"use client";

import { useEffect, useMemo, useState } from "react";
import { Globe, LineChart as LineIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

export function TrafficScreen() {
  const [businesses, setBusinesses] = useState<Record<string, unknown>[]>([]);
  const [snapshots, setSnapshots] = useState<Record<string, unknown>[]>([]);
  const [selected, setSelected] = useState<string>("all");

  useEffect(() => {
    async function load() {
      const [b, s] = await Promise.all([fetch("/api/businesses"), fetch("/api/analytics-snapshots")]);
      if (b.ok) setBusinesses(await b.json());
      if (s.ok) setSnapshots(await s.json());
    }
    load();
  }, []);

  const filteredSnaps = useMemo(() => {
    if (selected === "all") return snapshots;
    return snapshots.filter((snap) => String(snap.business_id) === selected);
  }, [snapshots, selected]);

  const totals = useMemo(() => {
    let pageviews = 0;
    let visitors = 0;
    filteredSnaps.forEach((snap) => {
      const p = (snap.payload ?? {}) as Record<string, unknown>;
      const t = p.totals as Record<string, unknown> | undefined;
      pageviews += Number(t?.pageviews ?? p.pageviews ?? 0);
      visitors += Number(t?.visitors ?? p.visitors ?? 0);
    });
    return { pageviews, visitors };
  }, [filteredSnaps]);

  const chartData = useMemo(() => {
    return filteredSnaps.slice(0, 14).map((snap, idx) => {
      const p = (snap.payload ?? {}) as Record<string, unknown>;
      const t = p.totals as Record<string, unknown> | undefined;
      return {
        label: `#${idx + 1}`,
        value: Number(t?.pageviews ?? p.pageviews ?? 0),
      };
    });
  }, [filteredSnaps]);

  const umamiBase = process.env.NEXT_PUBLIC_UMAMI_URL ?? "https://your-umami.vercel.app";
  const activeBusiness = businesses.find((b) => String(b.id) === selected);
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
            <p className="text-sm text-muted-foreground">Filter portfolio</p>
            <Select value={selected} onValueChange={(v) => setSelected(v ?? "all")}>
              <SelectTrigger className="mt-1 w-full md:w-72">
                <SelectValue placeholder="Choose business" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All businesses</SelectItem>
                {businesses.map((b) => (
                  <SelectItem key={String(b.id)} value={String(b.id)}>
                    {String(b.name)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Globe className="h-4 w-4" />
              GDPR-friendly · no cookies
            </span>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pageviews (snapshots)</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-semibold">{totals.pageviews}</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Visitors (aggregated)</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-semibold">{totals.visitors || "—"}</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Data source</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Pulled via `TrafficMonitor` → Umami API → `analytics_snapshots`.
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <LineIcon className="h-4 w-4" />
              Snapshot pulse
            </CardTitle>
            <span className="text-xs text-muted-foreground">Last payloads</span>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot />
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
              <Textarea placeholder="example.com" className="min-h-[96px]" disabled readOnly value="Run the engine locally: python -m engine.main traffic" />
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
          </CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="label" hide />
                <YAxis hide />
                <Tooltip />
                <Bar dataKey="value" fill="hsl(var(--chart-2))" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
