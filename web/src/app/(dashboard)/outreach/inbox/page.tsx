import Link from "next/link";
import { OutreachInboxScreen } from "@/components/screens/outreach-inbox-screen";
import { Button } from "@/components/ui/button";

export default function OutreachInboxPage() {
  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Outreach Inbox</h1>
          <p className="text-sm text-muted-foreground">Replies, hot leads, and operator responses.</p>
        </div>
        <Button render={<Link href="/outreach" />} variant="outline" size="sm">
          ← Pipeline
        </Button>
      </div>
      <OutreachInboxScreen />
    </div>
  );
}
