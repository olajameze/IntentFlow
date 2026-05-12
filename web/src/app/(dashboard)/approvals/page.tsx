import { ApprovalsScreen } from "@/components/screens/approvals-screen";

export default function ApprovalsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pending approvals</h1>
        <p className="text-sm text-muted-foreground">Green-light social posts drafted by the engine.</p>
      </div>
      <ApprovalsScreen />
    </div>
  );
}
