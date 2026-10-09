"use client";

import { useEffect } from "react";
import { refreshSession } from "@/lib/session-refresh";
import { usePathname } from "next/navigation";

const REFRESH_WINDOW_MS = 5 * 60 * 1000;

function readSessionExp(): number | null {
  const match = document.cookie.match(/(^| )session_exp=([^;]+)/);
  if (!match) return null;
  const exp = parseInt(match[2], 10);
  return Number.isFinite(exp) ? exp : null;
}

/**
 * No periodic polling. Schedules a single timer near expiry and re-checks on
 * focus/visibility — avoids waking JS every few minutes for a no-op.
 */
export default function SessionWatcher() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname === "/verify/student") return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const clearTimer = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    let refreshing = false;
    let retryAfter = 0;
    const maybeRefresh = async () => {
      if (cancelled || refreshing || !navigator.onLine || document.visibilityState === "hidden" || Date.now() < retryAfter) return;
      refreshing = true;
      retryAfter = Date.now() + 60_000;
      try { await refreshSession(); }
      catch { /* Foreground requests surface authentication failures. */ }
      finally { refreshing = false; if (!cancelled) schedule(); }
    };

    const schedule = () => {
      clearTimer();
      if (cancelled || !navigator.onLine || document.visibilityState === "hidden") return;
      const exp = readSessionExp();
      if (exp == null) return;

      const remaining = exp - Date.now();
      if (remaining < REFRESH_WINDOW_MS) {
        if (Date.now() >= retryAfter) void maybeRefresh();
        else timer = setTimeout(() => void maybeRefresh(), Math.max(1000, retryAfter - Date.now()));
        return;
      }

      // Wake once, ~5 minutes before expiry (cap delay for setTimeout safety).
      const delay = Math.min(remaining - REFRESH_WINDOW_MS, 24 * 60 * 60 * 1000);
      timer = setTimeout(() => {
        if (cancelled) return;
        void maybeRefresh();
      }, Math.max(delay, 1000));
    };

    const onVisible = () => { schedule(); };

    schedule();
    window.addEventListener("focus", onVisible);
    window.addEventListener("online", onVisible);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearTimer();
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("online", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pathname]);

  return null;
}
