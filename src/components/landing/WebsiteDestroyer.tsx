"use client";

import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
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
  const inviteRef = useRef<HTMLDialogElement>(null);
  const offeredRef = useRef(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const closeGame = useCallback(() => {
    setActive(false);
    if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!showInvite || active) return;
    const dialog = inviteRef.current;
    if (!dialog) return;
    dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus({ preventScroll: true });
    };
  }, [showInvite, active]);

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
    {showInvite && !active && createPortal(<dialog ref={inviteRef} className={`${styles.invite} ${styles.inviteDialog}`} aria-labelledby="destroyer-invite-title" aria-describedby="destroyer-invite-description" onCancel={() => setShowInvite(false)} data-destroyer-ui>
      <button type="button" className={styles.inviteClose} aria-label="Dismiss break invitation" onClick={() => setShowInvite(false)}><X size={16} /></button>
      <div className={styles.inviteBadge}>NISAAB360 / OFF THE CLOCK</div>
      <h2 id="destroyer-invite-title" className={styles.inviteTitle}>DESTROY<br /><span>THIS WEBSITE.</span></h2>
      <div className={styles.inviteArena} aria-hidden="true">
        <div className={styles.inviteWebsite}>
          <div className={styles.inviteBrowser}><i /><i /><i /><span>nisaab360.app</span></div>
          <div className={styles.inviteMockContent}><b>A very nice website.</b><span>Please handle with care.</span><div><i /><i /><i /></div></div>
        </div>
        <svg className={styles.inviteDamage} viewBox="0 0 540 220" fill="none">
          <path d="m294 77 18-34 5 34 36-10-19 26 34 18-39 6 15 34-34-19-17 32-7-36-34 12 19-29-26-16 38-2Z" fill="#23231f" />
          <path d="m295 92-53-30-21-31m68 78-76 18-30 34m127-48 50 35 35 4m-92-39 29-64" stroke="#23231f" strokeWidth="2" />
          <path d="m354 47 20-13 5 21Z M373 106l25-8-7 24Z M325 175l19-11 9 25Z M217 72l-17-12 1 20Z M259 171l-16 9 19 9Z" fill="#e4432e" />
          <path d="m398 57 17-9m-22 87 19 9m-76 45 5 15m-116-61-17 7" stroke="#23231f" strokeWidth="3" />
        </svg>
        <svg className={styles.inviteHammer} viewBox="0 0 180 220" fill="none">
          <path d="m80 80 23 9-38 120-16 6-9-15Z" fill="#ba6e36" stroke="#23231f" strokeWidth="4" />
          <path d="m56 172 15 6m-20 6 15 6m-19 5 15 6" stroke="#633c25" strokeWidth="3" />
          <path d="m38 33 84 22-9 51-83-23-9-21Z" fill="#343832" stroke="#171914" strokeWidth="4" />
          <path d="m38 33 9-16 86 23-11 15Z" fill="#92968b" stroke="#171914" strokeWidth="4" />
          <path d="m122 55 11-15 5 47-25 19Z" fill="#666c60" stroke="#171914" strokeWidth="4" />
          <path d="m43 44 66 18" stroke="#c9cdbf" strokeWidth="3" />
        </svg>
        <span className={styles.inviteScribble}>Go on. It can take it.</span>
        <span className={styles.inviteTape}>APPROVED FOR DEMOLITION</span>
      </div>
      <p id="destroyer-invite-description">We spent ages building this.<br /><b>You could undo it in seconds.</b></p>
      <button type="button" className={styles.inviteStart} onClick={() => { setShowInvite(false); setActive(true); }}>HAND ME THE HAMMER <span aria-hidden="true">↗</span></button>
      <div className={styles.inviteFooter}><span>Break it. Rebuild it.<br />No real damage. Just a game.</span><button type="button" className={styles.inviteSkip} onClick={() => setShowInvite(false)}>I&apos;ll be nice.</button></div>
    </dialog>, document.body)}
    {active && <GameLoadBoundary onExit={closeGame}><Suspense fallback={createPortal(
      <aside className={styles.invite} data-destroyer-ui role="status"><strong>Loading demolition mode...</strong>
        <button type="button" className={styles.inviteClose} aria-label="Cancel loading demolition mode" onClick={closeGame}><X size={16} /></button>
      </aside>, document.body)}><Game onExit={closeGame} focusRef={returnFocusRef} /></Suspense></GameLoadBoundary>}
  </>;
}
