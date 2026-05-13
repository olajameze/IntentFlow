import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";
import { Providers } from "@/components/providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "IntentFlow · Omni-Channel Marketing Engine",
  description: "Privacy-first analytics, revenue intelligence, and CrewAI automations for every brand you run.",
  manifest: "/manifest.webmanifest",
  applicationName: "IntentFlow",
  icons: {
    icon: [{ url: "/icons/icon-192.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icons/icon-192.svg", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "IntentFlow",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* Extensions (e.g. Grammarly: data-gr-ext-installed) mutate <body>; suppress avoids hydration warnings */}
      <body suppressHydrationWarning className={cn("min-h-screen bg-background font-sans antialiased", inter.variable)}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
