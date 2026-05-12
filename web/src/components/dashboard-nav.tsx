"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CheckCircle2,
  Home,
  LineChart,
  Settings,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Home", icon: Home },
  { href: "/traffic", label: "Traffic", icon: TrendingUp },
  { href: "/revenue", label: "Revenue", icon: Wallet },
  { href: "/approvals", label: "Approvals", icon: CheckCircle2 },
  { href: "/analytics", label: "Analytics", icon: LineChart },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function DashboardNav() {
  const pathname = usePathname();
  return (
    <>
      <aside className="hidden md:flex md:w-56 md:flex-col md:border-r md:bg-card md:px-3 md:py-4">
        <div className="mb-6 px-2">
          <div className="text-lg font-semibold tracking-tight">IntentFlow</div>
          <p className="text-xs text-muted-foreground">Omni-Channel Engine</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1" aria-label="Primary">
          {items.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition",
                  active ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-6 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <BarChart3 className="h-4 w-4" />
            100% Satisfaction
          </div>
          <p className="mt-2 leading-relaxed">Privacy-first analytics via Umami · No Google Analytics.</p>
        </div>
      </aside>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        aria-label="Mobile primary"
      >
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 text-[11px]",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
