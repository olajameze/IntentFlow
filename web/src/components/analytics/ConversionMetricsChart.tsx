"use client";

import { useId } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
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

export interface ChartSnapshot {
  period: string;
  revenue: number;
  traffic: number;
}

const sampleSnapshotData: ChartSnapshot[] = [
  { period: "Wk 01", revenue: 1500, traffic: 800 },
  { period: "Wk 02", revenue: 2200, traffic: 1200 },
  { period: "Wk 03", revenue: 1900, traffic: 1100 },
  { period: "Wk 04", revenue: 4200, traffic: 2100 },
  { period: "Wk 05", revenue: 3800, traffic: 1950 },
  { period: "Wk 06", revenue: 5400, traffic: 2800 },
];

const REV_STROKE = "#4f46e5";
const TRAFFIC_STROKE = "#10b981";

type Props = {
  data?: ChartSnapshot[];
  className?: string;
};

export default function ConversionMetricsChart({ data, className }: Props) {
  const chartData = data?.length ? data : sampleSnapshotData;
  const svg = useChartSvgColors();
  const uid = useId().replace(/:/g, "");
  const revenueGradId = `chartRevenueGlow-${uid}`;
  const trafficGradId = `chartTrafficGlow-${uid}`;

  return (
    <div
      className={`w-full rounded-2xl border border-border bg-card p-6 shadow-sm transition-all duration-200 ${className ?? ""}`}
    >
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            Engine acquisition & revenue conversion
          </h3>
          <p className="text-xs text-muted-foreground">
            Correlating organic traffic volume against absolute closed financial value.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs font-medium">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: REV_STROKE }} />
            <span className="text-muted-foreground">Revenue volume (£)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: TRAFFIC_STROKE }} />
            <span className="text-muted-foreground">Traffic (visits)</span>
          </div>
        </div>
      </div>

      <div className="h-64 w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 8, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id={revenueGradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={REV_STROKE} stopOpacity={0.14} />
                <stop offset="95%" stopColor={REV_STROKE} stopOpacity={0} />
              </linearGradient>
              <linearGradient id={trafficGradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={TRAFFIC_STROKE} stopOpacity={0.14} />
                <stop offset="95%" stopColor={TRAFFIC_STROKE} stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid
              stroke={svg.border}
              strokeDasharray="4 4"
              vertical={false}
              opacity={0.5}
            />
            <XAxis
              dataKey="period"
              axisLine={false}
              tickLine={false}
              tick={svg.axisTick}
              dy={4}
            />
            <YAxis
              yAxisId="left"
              axisLine={false}
              tickLine={false}
              tick={svg.axisTick}
              width={48}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              axisLine={false}
              tickLine={false}
              tick={svg.axisTick}
              width={48}
            />
            <Tooltip
              contentStyle={chartTooltipContentStyle}
              labelStyle={chartTooltipLabelStyle}
              itemStyle={chartTooltipItemStyle}
              formatter={(value, name) => {
                const nm = String(name ?? "");
                const num = Number(value ?? 0);
                if (nm === "revenue") {
                  return [`£${Number.isFinite(num) ? num.toLocaleString("en-GB", { maximumFractionDigits: 0 }) : "—"}`, "Revenue"];
                }
                return [Number.isFinite(num) ? num.toLocaleString("en-GB") : "—", "Traffic"];
              }}
              cursor={{ stroke: svg.border, strokeWidth: 1 }}
            />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="revenue"
              name="revenue"
              stroke={REV_STROKE}
              strokeWidth={2}
              fillOpacity={1}
              fill={`url(#${revenueGradId})`}
            />
            <Area
              yAxisId="right"
              type="monotone"
              dataKey="traffic"
              name="traffic"
              stroke={TRAFFIC_STROKE}
              strokeWidth={2}
              fillOpacity={1}
              fill={`url(#${trafficGradId})`}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
