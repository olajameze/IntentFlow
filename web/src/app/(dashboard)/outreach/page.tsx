import Link from "next/link";
import { OutreachScreen } from "@/components/screens/outreach-screen";
import { Button } from "@/components/ui/button";

export default function OutreachPage() {
  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Outreach</h1>
          <p className="text-sm text-muted-foreground">
            Multi-campaign email pipeline — PestTrace, Weathers, JGDevs.
          </p>
        </div>
        <Button render={<Link href="/outreach/inbox" />} variant="outline" size="sm">
          Open inbox →
        </Button>
      </div>
      <OutreachScreen />
    </div>
  );
}
