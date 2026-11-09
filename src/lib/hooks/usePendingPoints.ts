"use client";

import { useEffect, useState } from "react";
import { pendingCountAction } from "@/app/actions/points";

const POLL_MS = 30_000;

/**
 * Pending reward requests, for the Points nav badge.
 *
 * Polled through a server action (never a browser Supabase call - several
 * Myanmar networks block *.supabase.co), every 30 s while the tab is visible
 * and once on return. Not fetched per page render on purpose: that would add
 * a Sydney round trip to every screen for a number staff glance at.
 * null = unknown (no badge), never a guess.
 */
export function usePendingPoints(enabled: boolean): number | null {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = () => {
      if (document.visibilityState !== "visible") return;
      pendingCountAction()
        .then((n) => {
          if (!cancelled) setCount(n);
        })
        .catch(() => {});
    };
    load();
    const timer = setInterval(load, POLL_MS);
    document.addEventListener("visibilitychange", load);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, [enabled]);

  return count;
}
