"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const DEFAULT_INTERVAL_MS = 10_000;

/**
 * Periodically re-runs the current route's server components.
 *
 * This is what stands in for Supabase Realtime. Realtime is a WebSocket to
 * *.supabase.co, and several Myanmar mobile operators refuse that connection
 * outright - measured on Ooredoo: refused in 58-83ms on WiFi, silently dropped
 * until a 12s timeout on mobile data, while the same handset reached
 * everything else normally. It also cannot be proxied: Vercel does not upgrade
 * protocol across a rewrite, so routing it through our own origin - the trick
 * that fixes every other Supabase call here - does not work for a socket.
 *
 * Polling keeps the traffic on this app's own origin, which every network we
 * tested reaches. On a shop floor with two staff sharing the board, a station
 * one of them frees needs to show up on the other's screen without a manual
 * reload; ten seconds is well inside how fast that matters.
 *
 * router.refresh() re-fetches server components while preserving client state,
 * so an open modal, half-typed input and scroll position all survive a tick.
 */
export function useAutoRefresh(intervalMs: number = DEFAULT_INTERVAL_MS) {
  const router = useRouter();

  useEffect(() => {
    const refresh = () => {
      // This screen sits open all day. Refreshing a tab nobody is looking at
      // spends the shop's bandwidth for nothing, and the listeners below catch
      // up the instant it is brought back.
      if (document.visibilityState !== "visible") return;
      router.refresh();
    };

    const timer = setInterval(refresh, intervalMs);
    const onVisibilityChange = () => refresh();

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", refresh);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", refresh);
    };
  }, [router, intervalMs]);
}
