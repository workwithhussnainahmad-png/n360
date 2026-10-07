"use client";

import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Gamepad2, Hammer, X } from "lucide-react";
import styles from "./WebsiteDestroyer.module.css";

// The physics, canvas snapshotter, weapon art and game CSS load only after Start.
const Game = lazy(() => import("./DestroyerGame").then(module => ({ default: module.DestroyerGame })));
const IDLE_DELAY = 30_000;
const SUPPORTED_VIEWPORT = "(min-width: 768px)";
function subscribeViewport(onChange: () => void) {
  const query = window.matchMedia(SUPPORTED_VIEWPORT);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const viewportSupported = () => window.matchMedia(SUPPORTED_VIEWPORT).matches;
const serverViewport = () => false;

class GameLoadBoundary extends Component<{children: ReactNode; onExit: () => void}, {failed: boolean}> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return createPortal(<aside className={styles.invite} data-destroyer-ui role="alert">
      <strong>Couldn&apos;t load the game</strong><p>Refresh the page to try again.</p>
      <button type="button" className={styles.inviteStart} onClick={this.props.onExit}>Close</button>
    </aside>, document.body);
  }
}

export function WebsiteDestroyer() {
  const enabled = useSyncExternalStore(subscribeViewport, viewportSupported, serverViewport);
  // Unmounting the controller also cancels idle checks and restores an active
  // game immediately when the viewport changes to mobile, including mid-rebuild.
  return enabled ? <SupportedDestroyer /> : null;
}

function SupportedDestroyer() {
  const [active, setActive] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const offeredRef = useRef(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const closeGame = useCallback(() => {
    setActive(false);
    if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (active || offeredRef.current) return;
    let lastActivity = performance.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let focused = document.hasFocus();
    const pressedPointers = new Set<number>();
    const activity = () => { lastActivity = performance.now(); };
    const pointerDown = (event: PointerEvent) => { pressedPointers.add(event.pointerId); activity(); };
    const pointerEnd = (event: PointerEvent) => { pressedPointers.delete(event.pointerId); activity(); };
    const removeListeners = () => {
      window.removeEventListener("pointermove", activity, true);
      window.removeEventListener("pointerdown", pointerDown, true);
      window.removeEventListener("pointerup", pointerEnd, true);
      window.removeEventListener("pointercancel", pointerEnd, true);
      window.removeEventListener("wheel", activity, true);
      window.removeEventListener("scroll", activity, true);
      window.removeEventListener("focus", focus);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibility);
    };
    const check = () => {
      timer = undefined;
      if (document.hidden || !focused || offeredRef.current) return;
      if (pressedPointers.size > 0) {
        activity();
        timer = setTimeout(check, IDLE_DELAY);
        return;
      }
      const remaining = IDLE_DELAY - (performance.now() - lastActivity);
      if (remaining > 0) { timer = setTimeout(check, remaining); return; }
      offeredRef.current = true;
      removeListeners();
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setShowInvite(true);
    };
    const visibility = () => {
      clearTimeout(timer);
      pressedPointers.clear();
      focused = document.hasFocus();
      if (!document.hidden && focused && !offeredRef.current) { activity(); timer = setTimeout(check, IDLE_DELAY); }
    };
    const focus = () => {
      focused = true;
      clearTimeout(timer);
      if (!document.hidden && !offeredRef.current) { activity(); timer = setTimeout(check, IDLE_DELAY); }
    };
    const blur = () => { focused = false; pressedPointers.clear(); clearTimeout(timer); };
    // Activity writes one timestamp, rather than canceling/creating timers per event.
    if (!document.hidden && focused) timer = setTimeout(check, IDLE_DELAY);
    const passiveCapture = { passive: true, capture: true };
    window.addEventListener("pointermove", activity, passiveCapture);
    window.addEventListener("pointerdown", pointerDown, passiveCapture);
    window.addEventListener("pointerup", pointerEnd, passiveCapture);
    window.addEventListener("pointercancel", pointerEnd, passiveCapture);
    window.addEventListener("wheel", activity, passiveCapture);
    window.addEventListener("scroll", activity, passiveCapture);
    window.addEventListener("focus", focus);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", visibility);
    // Keyboard activity is intentionally ignored, as requested.
    return () => { clearTimeout(timer); removeListeners(); };
  }, [active]);

  return <>
    {showInvite && !active && createPortal(<aside className={styles.invite} role="region" aria-label="Take a break" data-destroyer-ui>
      <button type="button" className={styles.inviteClose} aria-label="Dismiss break invitation" onClick={() => setShowInvite(false)}><X size={16} /></button>
      <div className={styles.inviteBadge}><Gamepad2 size={14} /> BONUS ROUND <span>OPTIONAL</span></div>
      <div className={styles.inviteArena} aria-hidden="true">
        <div className={styles.inviteBricks}><i /><i /><i /><i /><i /><i /></div>
        <Hammer className={styles.inviteHammer} size={62} strokeWidth={1.7} />
        <span className={styles.inviteSpark}>✦</span>
        <span className={styles.inviteArenaLabel}>DEMOLITION MODE</span>
      </div>
      <strong>Ready to smash something?</strong>
      <p>Grab a hammer, break this page, then rebuild it. Your next little break starts here.</p>
      <button type="button" className={styles.inviteStart} onClick={() => { setShowInvite(false); setActive(true); }}><Gamepad2 size={18} /> Start bonus round</button>
      <button type="button" className={styles.inviteSkip} onClick={() => setShowInvite(false)}>Keep browsing</button>
    </aside>, document.body)}
    {active && <GameLoadBoundary onExit={closeGame}><Suspense fallback={createPortal(
      <aside className={styles.invite} data-destroyer-ui role="status"><strong>Loading demolition mode...</strong>
        <button type="button" className={styles.inviteClose} aria-label="Cancel loading demolition mode" onClick={closeGame}><X size={16} /></button>
      </aside>, document.body)}><Game onExit={closeGame} focusRef={returnFocusRef} /></Suspense></GameLoadBoundary>}
  </>;
}
