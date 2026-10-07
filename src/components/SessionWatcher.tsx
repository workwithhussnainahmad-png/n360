"use client";

import { useEffect } from "react";
import { api } from "@/lib/api-client";

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
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const clearTimer = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const handleExpiry = async () => {
      if (!navigator.onLine) {
        try {
          await api.post("/api/auth/logout", {});
        } catch {
          // ignore
        }
        const isLocal = window.location.hostname.includes("localhost");
        window.location.replace(isLocal ? "/login" : "https://nisaab360.app/login");
      }
    };

    const maybeRefresh = async () => {
      if (!navigator.onLine) return;
      try {
        await api.post("/api/auth/refresh", {});
        schedule();
      } catch (err) {
        console.warn("Background session refresh failed", err);
      }
    };

    const schedule = () => {
      clearTimer();
      const exp = readSessionExp();
      if (exp == null) return;

      const remaining = exp - Date.now();
      if (remaining <= 0) {
        void handleExpiry();
        return;
      }

      if (remaining < REFRESH_WINDOW_MS) {
        void maybeRefresh();
        return;
      }

      // Wake once, ~5 minutes before expiry (cap delay for setTimeout safety).
      const delay = Math.min(remaining - REFRESH_WINDOW_MS, 24 * 60 * 60 * 1000);
      timer = setTimeout(() => {
        if (cancelled) return;
        void maybeRefresh();
      }, Math.max(delay, 1000));
    };

    const onVisible = () => {
      if (document.visibilityState === "hidden") return;
      const exp = readSessionExp();
      if (exp == null) return;
      const remaining = exp - Date.now();
      if (remaining <= 0) {
        void handleExpiry();
        return;
      }
      if (remaining < REFRESH_WINDOW_MS) void maybeRefresh();
      else schedule();
    };

    schedule();
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearTimer();
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
