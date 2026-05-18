import { HomeOverview } from "@/components/screens/home-overview";

export default function HomePage() {
  return (
    <div className="min-w-0 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Command centre</h1>
        <p className="text-sm text-muted-foreground">
          Live portfolio view across every active business — traffic (Umami), revenue, and approvals.
        </p>
      </div>
      <HomeOverview />
    </div>
  );
}
