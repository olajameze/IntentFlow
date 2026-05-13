"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function RevenueScreen() {
  const [businesses, setBusinesses] = useState<Record<string, unknown>[]>([]);
  const [entries, setEntries] = useState<Record<string, unknown>[]>([]);
  const [selected, setSelected] = useState<string>("all");
  const [form, setForm] = useState({
    business_id: "",
    amount: "",
    currency: "GBP",
    source: "manual",
    entry_date: new Date().toISOString().slice(0, 10),
    description: "",
  });

  useEffect(() => {
    async function load() {
      const [b, e] = await Promise.all([fetch("/api/businesses"), fetch("/api/revenue-entries")]);
      if (b.ok) {
        const data = await b.json();
        setBusinesses(data);
        if (data[0]) setForm((f) => ({ ...f, business_id: String(data[0].id) }));
      }
      if (e.ok) setEntries(await e.json());
    }
    load();
  }, []);

  const filtered = useMemo(() => {
    if (selected === "all") return entries;
    return entries.filter((row) => String(row.business_id) === selected);
  }, [entries, selected]);

  const totals = useMemo(() => {
    const sum = filtered.reduce((acc, row) => acc + Number(row.amount ?? 0), 0);
    const net = filtered.reduce((acc, row) => acc + Number(row.net_amount ?? row.amount ?? 0), 0);
    return { sum, net };
  }, [filtered]);

  const chartData = useMemo(() => {
    const bucket: Record<string, number> = {};
    filtered.forEach((row) => {
      const day = String(row.entry_date ?? "");
      bucket[day] = (bucket[day] ?? 0) + Number(row.amount ?? 0);
    });
    return Object.entries(bucket)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => ({ label: k, value: v }));
  }, [filtered]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/revenue-entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        business_id: form.business_id,
        amount: Number(form.amount),
        currency: form.currency,
        source: form.source,
        entry_date: form.entry_date,
        description: form.description,
      }),
    });
    if (!res.ok) {
      toast.error("Could not save revenue");
      return;
    }
    toast.success("Revenue logged");
    const list = await fetch("/api/revenue-entries");
    if (list.ok) setEntries(await list.json());
  };

  const onCsv = async (file: File | undefined) => {
    if (!file || !form.business_id) {
      toast.error("Pick a business and CSV");
      return;
    }
    const data = new FormData();
    data.append("business_id", form.business_id);
    data.append("file", file);
    const res = await fetch("/api/import-csv", { method: "POST", body: data });
    if (!res.ok) {
      toast.error("Import failed");
      return;
    }
    toast.success("CSV imported");
  };

  return (
    <Tabs defaultValue="overview">
      <TabsList className="grid w-full grid-cols-2 md:inline-flex">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="import">Import / manual</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Select value={selected} onValueChange={(v) => setSelected(typeof v === "string" ? v : "all")}>
            <SelectTrigger className="w-full md:w-72">
              <SelectValue placeholder="Filter business" />
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
          <div className="text-sm text-muted-foreground">
            Total £{totals.sum.toFixed(2)} · Net £{totals.net.toFixed(2)}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Revenue cadence</CardTitle>
            </CardHeader>
            <CardContent className="min-w-0">
              <ResponsiveContainer width="100%" height={256}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="label" />
                  <YAxis />
                  <Tooltip />
                  <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorRev)" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ledger</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Business</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 20).map((row) => (
                  <TableRow key={String(row.id)}>
                    <TableCell>{String(row.entry_date)}</TableCell>
                    <TableCell>
                      {String(
                        businesses.find((b) => String(b.id) === String(row.business_id))?.name ?? row.business_id,
                      )}
                    </TableCell>
                    <TableCell>
                      £{Number(row.amount).toFixed(2)} {String(row.currency)}
                    </TableCell>
                    <TableCell>{String(row.source)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="import" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Manual entry</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3 md:grid-cols-2" onSubmit={onSubmit}>
              <div className="space-y-2 md:col-span-2">
                <Label>Business</Label>
                <Select
                  value={form.business_id}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, business_id: typeof v === "string" ? v : f.business_id }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select business" />
                  </SelectTrigger>
                  <SelectContent>
                    {businesses.map((b) => (
                      <SelectItem key={String(b.id)} value={String(b.id)}>
                        {String(b.name)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Amount</Label>
                <Input
                  inputMode="decimal"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Input value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Source</Label>
                <Select
                  value={form.source}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, source: typeof v === "string" ? v : f.source }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="stripe">Stripe</SelectItem>
                    <SelectItem value="paypal">PayPal</SelectItem>
                    <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="invoice">Invoice</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={form.entry_date}
                  onChange={(e) => setForm((f) => ({ ...f, entry_date: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Notes</Label>
                <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
              </div>
              <Button type="submit" className="md:col-span-2 h-12">
                Save revenue
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">CSV import</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Headers: date, amount, currency, description, customer (flexible). Uses server-side normaliser.</p>
            <Input type="file" accept=".csv,text/csv" onChange={(e) => onCsv(e.target.files?.[0])} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Stripe pairing</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>Add the restricted key under Settings → Businesses. RevenueTracker syncs every six hours via GitHub Actions.</p>
            <div className="min-w-0 rounded-lg border bg-muted/40 p-4">
              <ResponsiveContainer width="100%" height={160}>
                <BarChart
                  data={chartData.slice(-7)}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="label" hide />
                  <YAxis hide />
                  <Tooltip />
                  <Bar dataKey="value" fill="hsl(var(--chart-4))" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
