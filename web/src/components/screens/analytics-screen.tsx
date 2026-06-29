"use client";

import { useEffect, useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
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
import { latestSnapshotPerBusiness } from "@/lib/analytics-snapshots";
import ConversionMetricsChart, { type ChartSnapshot } from "@/components/analytics/ConversionMetricsChart";

export function AnalyticsScreen() {
  const svg = useChartSvgColors();
  const [businesses, setBusinesses] = useState<Record<string, unknown>[]>([]);
  const [snapshots, setSnapshots] = useState<Record<string, unknown>[]>([]);
  const [revenue, setRevenue] = useState<Record<string, unknown>[]>([]);
  const [leads, setLeads] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    async function load() {
      const [b, s, r, l] = await Promise.all([
        fetch("/api/businesses"),
        fetch("/api/analytics-snapshots"),
        fetch("/api/revenue-entries"),
        fetch("/api/leads"),
      ]);
      if (b.ok) setBusinesses(await b.json());
      if (s.ok) setSnapshots(await s.json());
      if (r.ok) setRevenue(await r.json());
      if (l.ok) setLeads(await l.json());
    }
    load();
  }, []);

  const merged = useMemo(() => {
    const latestByBiz = latestSnapshotPerBusiness(snapshots);
    return businesses.map((biz) => {
      const id = String(biz.id);
      const latest = latestByBiz.get(id);
      const traffic = latest ? claritySessionsFromPayload(latest.payload) : 0;
      const rev = revenue
        .filter((row) => String(row.business_id) === id)
        .reduce((acc, row) => acc + Number(row.amount ?? 0), 0);
      const leadCount = leads.filter((x) => String(x.business_id) === id).length;
      return { name: String(biz.name), traffic, revenue: rev, leads: leadCount };
    });
  }, [businesses, snapshots, revenue, leads]);

  const trend = useMemo(() => {
    return snapshots.slice(0, 12).map((snap, idx) => {
      return {
        label: `#${idx + 1}`,
        traffic: claritySessionsFromPayload(snap.payload),
        revenue: revenue[idx] ? Number((revenue[idx] as Record<string, unknown>).amount) : 0,
      };
    });
  }, [snapshots, revenue]);

  const conversionChartData = useMemo((): ChartSnapshot[] | undefined => {
    if (trend.length < 2) return undefined;
    return trend.slice(-6).map((row) => ({
      period: String(row.label),
      revenue: row.revenue,
      traffic: row.traffic,
    }));
  }, [trend]);

  return (
    <div className="space-y-6">
      {snapshots.length === 0 ? (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="text-base">No analytics snapshots</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Run the Clarity sync job so stats are saved to Supabase, or confirm{" "}
            <code className="rounded bg-muted px-1">/api/analytics-snapshots</code> returns rows. Traffic charts use
            Clarity session counts from the Data Export API (max 3-day window).
          </CardContent>
        </Card>
      ) : null}

      <ConversionMetricsChart data={conversionChartData} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tri-line overlay</CardTitle>
        </CardHeader>
        <CardContent className="min-w-0">
          <ResponsiveContainer width="100%" height={288}>
            <ComposedChart data={trend} margin={{ top: 12, right: 12, left: -4, bottom: 8 }}>
              <CartesianGrid stroke={svg.border} strokeDasharray="3 3" vertical={false} opacity={0.45} />
              <XAxis dataKey="label" tick={svg.axisTick} tickLine={false} axisLine={{ stroke: svg.border }} />
              <YAxis yAxisId="left" tick={svg.axisTick} tickLine={false} axisLine={{ stroke: svg.border }} width={44} />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={svg.axisTick}
                tickLine={false}
                axisLine={{ stroke: svg.border }}
                width={44}
              />
              <Tooltip
                contentStyle={chartTooltipContentStyle}
                labelStyle={chartTooltipLabelStyle}
                itemStyle={chartTooltipItemStyle}
                formatter={(value, name) => {
                  const nm = String(name ?? "");
                  const num = Number(value ?? 0);
                  const formatted =
                    nm === "revenue" ? `£${Number.isFinite(num) ? num.toFixed(0) : "—"}` : String(value ?? "—");
                  return [formatted, nm === "traffic" ? "Traffic (views)" : "Revenue (£)"];
                }}
                cursor={{ stroke: svg.border, strokeWidth: 1 }}
              />
              <Legend
                wrapperStyle={{ paddingTop: 12, fontSize: 12 }}
                iconType="plainline"
                formatter={(value) => (String(value) === "traffic" ? "Traffic" : "Revenue")}
              />
              <Line
                yAxisId="left"
                name="traffic"
                type="monotone"
                dataKey="traffic"
                stroke={svg.chart1}
                strokeWidth={2.5}
                dot={{ r: 2.5, fill: svg.chart1, stroke: svg.card, strokeWidth: 1.5 }}
              />
              <Line
                yAxisId="right"
                name="revenue"
                type="monotone"
                dataKey="revenue"
                stroke={svg.chart2}
                strokeWidth={2.5}
                dot={{ r: 2.5, fill: svg.chart2, stroke: svg.card, strokeWidth: 1.5 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Business</TableHead>
                <TableHead>Leads</TableHead>
                <TableHead>Traffic index</TableHead>
                <TableHead>Revenue (£)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {merged.map((row) => (
                <TableRow key={row.name}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>{row.leads}</TableCell>
                  <TableCell>{row.traffic}</TableCell>
                  <TableCell>{row.revenue.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
