import { RevenueScreen } from "@/components/screens/revenue-screen";

export default function RevenuePage() {
  return (
    <div className="min-w-0 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Revenue intelligence</h1>
        <p className="text-sm text-muted-foreground">Stripe, manual entries, and merged CSV pipelines.</p>
      </div>
      <RevenueScreen />
    </div>
  );
}
