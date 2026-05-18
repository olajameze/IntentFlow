"use client";

import { useEffect } from "react";

/**
 * Listens for service worker `controllerchange` events and reloads the page.
 *
 * With `skipWaiting: true` in next-pwa, the new SW activates immediately after
 * install. Without a reload the page still serves stale cached assets. This
 * component triggers a single reload as soon as the new controller takes over,
 * so users always see the latest build automatically.
 */
export function PwaUpdateListener() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let reloading = false;

    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  return null;
}
