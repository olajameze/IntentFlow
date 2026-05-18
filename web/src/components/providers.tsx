"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { PwaUpdateListener } from "@/components/pwa-update-listener";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
      <Toaster richColors closeButton />
      <PwaUpdateListener />
    </ThemeProvider>
  );
}
