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
      <div className={styles.inviteBadge}><Gamepad2 size={15} /> SECRET BONUS ROUND</div>
      <div className={styles.inviteArena} aria-hidden="true">
        <span className={styles.inviteOrbit} />
        <div className={styles.inviteWebsite}>
          <div className={styles.inviteBrowser}><i /><i /><i /><span>nisaab360.app</span></div>
          <div className={styles.inviteMockContent}><span /><span /><div><i /><i /><i /></div></div>
        </div>
        <div className={styles.inviteBricks}><i /><i /><i /><i /><i /><i /></div>
        <span className={styles.inviteSpark}>✦</span>
        <Hammer className={styles.inviteHammer} size={112} strokeWidth={1.6} />
        <span className={styles.inviteImpact}>SMASH!</span>
        <span className={styles.inviteArenaLabel}>THIS PAGE IS YOUR PLAYGROUND</span>
      </div>
      <h2 id="destroyer-invite-title">Nice website.<br /><span>Shame if you smashed it.</span></h2>
      <p id="destroyer-invite-description">Grab a hammer. Send pixels flying.<br />Then rebuild it all like nothing happened.</p>
      <div className={styles.inviteSteps} aria-hidden="true"><span>01 / SMASH</span><b>→</b><span>02 / REBUILD</span><b>→</b><span>03 / REPEAT</span></div>
      <button type="button" className={styles.inviteStart} onClick={() => { setShowInvite(false); setActive(true); }}><Hammer size={20} /> Let&apos;s wreck it <span aria-hidden="true">↗</span></button>
      <button type="button" className={styles.inviteSkip} onClick={() => setShowInvite(false)}>Spare this website. Keep browsing.</button>
      <span className={styles.inviteFootnote}>Just a game. Your data stays safe.</span>
    </dialog>, document.body)}
    {active && <GameLoadBoundary onExit={closeGame}><Suspense fallback={createPortal(
      <aside className={styles.invite} data-destroyer-ui role="status"><strong>Loading demolition mode...</strong>
        <button type="button" className={styles.inviteClose} aria-label="Cancel loading demolition mode" onClick={closeGame}><X size={16} /></button>
      </aside>, document.body)}><Game onExit={closeGame} focusRef={returnFocusRef} /></Suspense></GameLoadBoundary>}
  </>;
}
