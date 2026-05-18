import type { ReactNode } from "react";
import { DashboardNav } from "@/components/dashboard-nav";
import { ThemeToggle } from "@/components/theme-toggle";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <DashboardNav />
      {/* pb: clear fixed mobile nav (52px) + safe-area-inset-bottom (0 on Android, ~34px on iPhone notch) + 16px breathing room */}
      <main className="flex-1 pb-[calc(env(safe-area-inset-bottom,0px)+80px)] pt-4 md:pb-10 md:pt-6">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-end px-4 pb-2">
          <ThemeToggle />
        </div>
        <div className="mx-auto w-full max-w-6xl px-4">{children}</div>
      </main>
    </div>
  );
}
