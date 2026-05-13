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
import { umamiPageviewsFromPayload } from "@/lib/umami-payload";

export function AnalyticsScreen() {
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
    return businesses.map((biz) => {
      const id = String(biz.id);
      const traffic = snapshots
        .filter((s) => String(s.business_id) === id)
        .reduce((acc, s) => acc + umamiPageviewsFromPayload(s.payload), 0);
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
        traffic: umamiPageviewsFromPayload(snap.payload),
        revenue: revenue[idx] ? Number((revenue[idx] as Record<string, unknown>).amount) : 0,
      };
    });
  }, [snapshots, revenue]);

  return (
    <div className="space-y-6">
      {snapshots.length === 0 ? (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="text-base">No analytics snapshots</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Run the engine traffic job so Umami stats are saved to Supabase, or confirm{" "}
            <code className="rounded bg-muted px-1">/api/analytics-snapshots</code> returns rows. Traffic charts use the
            same Umami payload shape as the engine (pageviews with <code className="rounded bg-muted px-1">.value</code>{" "}
            on Umami Cloud).
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tri-line overlay</CardTitle>
        </CardHeader>
        <CardContent className="min-w-0">
          <ResponsiveContainer width="100%" height={288}>
            <ComposedChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="label" />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip />
              <Legend />
              <Line yAxisId="left" type="monotone" dataKey="traffic" stroke="hsl(var(--primary))" dot />
              <Line yAxisId="right" type="monotone" dataKey="revenue" stroke="hsl(var(--chart-2))" dot />
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
