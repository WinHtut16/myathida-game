"use client";

import { useEffect, useState } from "react";

/**
 * A clock that ticks, for deriving elapsed time on screen.
 *
 * Returns Date.now(), refreshed on an interval. Nothing counts UP here: the
 * elapsed time is always `now - startedAt`, where startedAt came from the
 * server. That distinction is the whole design. A counter that incremented
 * locally would drift, would reset on every reload, and would show two staff
 * on two phones two different numbers for the same TV.
 *
 * The interval stops while the tab is hidden. A shop leaves this board open all
 * day on a counter tablet, and re-rendering every station every second behind a
 * screen lock is pure battery. On return it ticks immediately, so nobody ever
 * sees a stale timer.
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;

    const start = () => {
      if (!timer) timer = setInterval(() => setNow(Date.now()), intervalMs);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = undefined;
      }
    };
    const onVisibilityChange = () => {
      if (document.hidden) {
        stop();
      } else {
        setNow(Date.now());
        start();
      }
    };

    start();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [intervalMs]);

  return now;
}
