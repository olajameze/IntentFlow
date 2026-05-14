"use client";

import { useLayoutEffect, useState } from "react";

/**
 * Recharts passes stroke/fill to SVG presentation attributes. Use resolved color
 * strings from the document theme instead of `var(--token)` literals, which are
 * unreliable on SVG attributes in some engines.
 */
const LIGHT_FALLBACK = {
  border: "oklch(0.9 0.025 268)",
  muted: "oklch(0.96 0.018 268)",
  mutedForeground: "oklch(0.46 0.03 265)",
  primary: "oklch(0.52 0.14 198)",
  card: "oklch(1 0.008 268)",
  chart1: "oklch(0.52 0.14 198)",
  chart2: "oklch(0.55 0.19 292)",
  chart3: "oklch(0.7 0.14 72)",
} as const;

function readVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export type ChartSvgColors = {
  border: string;
  muted: string;
  mutedForeground: string;
  primary: string;
  card: string;
  chart1: string;
  chart2: string;
  chart3: string;
  axisTick: { fill: string; fontSize: number };
};

const initial: ChartSvgColors = {
  border: LIGHT_FALLBACK.border,
  muted: LIGHT_FALLBACK.muted,
  mutedForeground: LIGHT_FALLBACK.mutedForeground,
  primary: LIGHT_FALLBACK.primary,
  card: LIGHT_FALLBACK.card,
  chart1: LIGHT_FALLBACK.chart1,
  chart2: LIGHT_FALLBACK.chart2,
  chart3: LIGHT_FALLBACK.chart3,
  axisTick: { fill: LIGHT_FALLBACK.mutedForeground, fontSize: 11 },
};

function readChartSvgColors(): ChartSvgColors {
  const border = readVar("--border", LIGHT_FALLBACK.border);
  const mfg = readVar("--muted-foreground", LIGHT_FALLBACK.mutedForeground);
  return {
    border,
    muted: readVar("--muted", LIGHT_FALLBACK.muted),
    mutedForeground: mfg,
    primary: readVar("--primary", LIGHT_FALLBACK.primary),
    card: readVar("--card", LIGHT_FALLBACK.card),
    chart1: readVar("--chart-1", LIGHT_FALLBACK.chart1),
    chart2: readVar("--chart-2", LIGHT_FALLBACK.chart2),
    chart3: readVar("--chart-3", LIGHT_FALLBACK.chart3),
    axisTick: { fill: mfg, fontSize: 11 },
  };
}

export function useChartSvgColors(): ChartSvgColors {
  const [c, setC] = useState<ChartSvgColors>(initial);

  useLayoutEffect(() => {
    setC(readChartSvgColors());
    const root = document.documentElement;
    const obs = new MutationObserver(() => setC(readChartSvgColors()));
    obs.observe(root, { attributes: true, attributeFilter: ["class", "data-theme"] });
    return () => obs.disconnect();
  }, []);

  return c;
}
