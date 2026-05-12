import type { ReactNode } from "react";
import { DashboardNav } from "@/components/dashboard-nav";
import { ThemeToggle } from "@/components/theme-toggle";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <DashboardNav />
      <main className="flex-1 pb-24 pt-4 md:pb-10 md:pt-6">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-end px-4 pb-2">
          <ThemeToggle />
        </div>
        <div className="mx-auto w-full max-w-6xl px-4">{children}</div>
      </main>
    </div>
  );
}
