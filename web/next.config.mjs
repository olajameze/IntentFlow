import withPWAInit from "@ducanh2912/next-pwa";

const isProd = process.env.NODE_ENV === "production";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Dev output lives in-repo (.next-dev) so tsconfig stays stable (no ..\\..\\AppData paths).
  // Pause OneDrive sync for this folder if chunks 404. Override with NEXT_DIST_DIR.
  ...(!isProd
    ? {
        distDir: process.env.NEXT_DIST_DIR || ".next-dev",
      }
    : {}),
  // Only touch webpack for `next build` — avoids "Webpack is configured while Turbopack is not" on `next dev --turbo`.
  ...(isProd
    ? {
        webpack: (config) => {
          // Synced/cloud-backed folders can corrupt persistent cache; prod build only.
          config.cache = false;
          return config;
        },
      }
    : {}),
};

const withPWA = withPWAInit({
  dest: "public",
  // Production: always on. Dev: off unless NEXT_PUBLIC_ENABLE_PWA_DEV=1 (test install on phone against local IP).
  disable: process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_ENABLE_PWA_DEV !== "1",
  register: true,
  skipWaiting: true,
});

export default withPWA(nextConfig);
