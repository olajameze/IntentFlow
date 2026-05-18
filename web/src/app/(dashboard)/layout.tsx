import type { ReactNode } from "react";
import { DashboardNav } from "@/components/dashboard-nav";
import { ThemeToggle } from "@/components/theme-toggle";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden md:flex-row">
      <DashboardNav />
      {/*
        Mobile bottom nav is fixed, 52px tall + env(safe-area-inset-bottom) padding.
        We use 120px base so the last card always has ~68px clearance above the nav
        on standard devices, and safe-area adds extra on notch/home-bar iPhones.
      */}
      <main className="flex-1 overflow-x-hidden pb-[calc(env(safe-area-inset-bottom,0px)+120px)] pt-4 md:pb-10 md:pt-6">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-end px-4 pb-2">
          <ThemeToggle />
        </div>
        <div className="mx-auto w-full max-w-6xl px-4">{children}</div>
      </main>
    </div>
  );
}
