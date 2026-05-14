import type { CSSProperties } from "react";

/** Shared Recharts tooltip + axis styling — reads theme CSS variables. */

export const chartTooltipContentStyle: CSSProperties = {
  background: "var(--popover)",
  color: "var(--popover-foreground)",
  border: "1px solid var(--border)",
  borderRadius: "10px",
  fontSize: "12px",
  boxShadow: "0 4px 24px oklch(0 0 0 / 0.08)",
};

export const chartTooltipLabelStyle: CSSProperties = {
  fontWeight: 600,
  marginBottom: "4px",
  color: "var(--foreground)",
};

export const chartTooltipItemStyle: CSSProperties = {
  color: "var(--muted-foreground)",
};
