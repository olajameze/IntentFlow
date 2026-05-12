import { TrafficScreen } from "@/components/screens/traffic-screen";

export default function TrafficPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Traffic intelligence</h1>
        <p className="text-sm text-muted-foreground">Umami-powered performance without Google Analytics.</p>
      </div>
      <TrafficScreen />
    </div>
  );
}
