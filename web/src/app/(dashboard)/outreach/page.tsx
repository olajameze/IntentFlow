import { OutreachScreen } from "@/components/screens/outreach-screen";

export default function OutreachPage() {
  return (
    <div className="min-w-0 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">PestTrace Outreach</h1>
        <p className="text-sm text-muted-foreground">
          B2B email pipeline — compliance-focused emails to pest control businesses across UK, USA, Canada, and Australia.
        </p>
      </div>
      <OutreachScreen />
    </div>
  );
}
