"use client";

import { useEffect, useRef } from "react";

/**
 * usePolling — run a callback immediately, then on a fixed interval.
 * Automatically pauses when the tab is hidden and resumes (with an immediate
 * refresh) when it becomes visible again. Cleans up on unmount.
 *
 * @param callback  async work to perform each tick
 * @param intervalMs  poll interval in milliseconds (pass null to disable)
 */
export function usePolling(callback: () => void | Promise<void>, intervalMs: number | null) {
  const savedCallback = useRef(callback);

  // Always point at the latest callback so the interval never goes stale.
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (intervalMs == null) return;

    let interval: ReturnType<typeof setInterval> | undefined;
    const tick = () => void savedCallback.current();

    const start = () => {
      tick(); // immediate first run
      interval = setInterval(tick, intervalMs);
    };
    const stop = () => {
      if (interval) clearInterval(interval);
      interval = undefined;
    };

    const handleVisibility = () => {
      if (document.hidden) stop();
      else start();
    };

    start();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [intervalMs]);
}
