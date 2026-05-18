import { SettingsScreen } from "@/components/screens/settings-screen";

export default function SettingsPage() {
  return (
    <div className="min-w-0 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Businesses, Umami, and Stripe connections.</p>
      </div>
      <SettingsScreen />
    </div>
  );
}
