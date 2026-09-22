"use client";

import { useEffect } from "react";

/** Registers the hub's passthrough service worker (PointSystem_AkoATP's
 * public/sw.js) — required for Chromium to consider the app installable.
 * This zone has no service worker of its own; both paths are origin-absolute
 * (not basePath-relative) because /sw.js is only ever served by the hub, and
 * a worker may claim any scope at or below its own script path, so /admin is
 * legal to register from a root-level script. Mounted once in the root layout. */
export function SWRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/admin" }).catch(() => {
        // Best-effort: install UI simply won't offer the native prompt if this fails.
      });
    }
  }, []);

  return null;
}
