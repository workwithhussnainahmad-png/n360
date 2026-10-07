"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { RefreshCw, X } from "lucide-react";
import styles from "./UpdateNotifier.module.css";

function isAuthenticatedPortalPath(pathname: string | null) {
  if (!pathname) return false;
  return (
    pathname.startsWith("/student") ||
    pathname.startsWith("/staff") ||
    pathname.startsWith("/parent") ||
    pathname.startsWith("/institution") ||
    pathname.startsWith("/employee") ||
    pathname.startsWith("/sa") ||
    pathname.startsWith("/batch-results") ||
    pathname.startsWith("/force-password-change")
  );
}

/**
 * Version check only on public surfaces, and only on window focus —
 * no interval polling (avoids /api/version CPU on idle authenticated users).
 */
export default function UpdateNotifier() {
  const pathname = usePathname();
  const [showUpdate, setShowUpdate] = useState(false);
  const latestVersion = useRef<string | null>(null);
  const dismissedVersion = useRef<string | null>(null);

  useEffect(() => {
    if (isAuthenticatedPortalPath(pathname)) return;

    const currentVersion = process.env.NEXT_PUBLIC_BUILD_ID;
    if (!currentVersion) return;

    let ignore = false;

    const checkVersion = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok || ignore) return;
        const data = await res.json();
        if (ignore) return;
        if (typeof data.version === "string" && data.version.length > 0 && data.version !== "dev" && data.version !== currentVersion && data.version !== dismissedVersion.current) {
          latestVersion.current = data.version;
          setShowUpdate(true);
        }
      } catch {
        // Ignore network errors
      }
    };

    const onFocus = () => void checkVersion();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    void checkVersion();

    return () => {
      ignore = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [pathname]);

  if (!showUpdate || isAuthenticatedPortalPath(pathname)) return null;

  return (
    createPortal(<aside className={styles.notice} role="status" aria-label="Website update available" data-destroyer-ui>
        <button type="button" className={styles.close} aria-label="Dismiss website update" onClick={() => {
          dismissedVersion.current = latestVersion.current; setShowUpdate(false);
        }}><X size={18} /></button>
        <strong>A new version is ready</strong>
        <p>Refresh to see the latest website updates.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className={styles.refresh}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh now
        </button>
    </aside>, document.body)
  );
}
