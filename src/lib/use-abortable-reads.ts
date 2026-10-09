"use client";
import { useEffect, useMemo, useRef } from "react";
export function useAbortableReads() {
  const requests = useRef(new Map<string, AbortController>());
  const reads = useMemo(() => ({
    begin(key: string, parent?: AbortSignal) {
      requests.current.get(key)?.abort();
      const controller = new AbortController();
      requests.current.set(key, controller);
      if (parent?.aborted) controller.abort();
      else parent?.addEventListener('abort', () => controller.abort(), { once: true });
      return controller.signal;
    },
    cancel(key: string) { requests.current.get(key)?.abort(); },
    cancelAll() { for (const request of requests.current.values()) request.abort(); requests.current.clear(); },
  }), []);
  useEffect(() => () => reads.cancelAll(), [reads]);
  return reads;
}
