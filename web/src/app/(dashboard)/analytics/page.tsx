import { AnalyticsScreen } from "@/components/screens/analytics-screen";

export default function AnalyticsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Portfolio analytics</h1>
        <p className="text-sm text-muted-foreground">Blend traffic, revenue, and pipeline signals.</p>
      </div>
      <AnalyticsScreen />
    </div>
  );
}
