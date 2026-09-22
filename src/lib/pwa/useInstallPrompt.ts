"use client";

import { useCallback, useSyncExternalStore } from "react";

export type InstallPlatform = "android" | "ios" | "macos" | "windows" | "other";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function detectPlatform(): InstallPlatform {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  // iPadOS 13+ reports as "Macintosh" but exposes touch points — check before macos.
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return "ios";
  if (/Macintosh/.test(ua)) return "macos";
  if (/Android/.test(ua)) return "android";
  if (/Windows/.test(ua)) return "windows";
  return "other";
}

function platformServerSnapshot(): InstallPlatform {
  return "other";
}

function noopSubscribe() {
  return () => {};
}

function isStandaloneSnapshot(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

function isStandaloneServerSnapshot(): boolean {
  return false;
}

function subscribeStandalone(callback: () => void) {
  const mql = window.matchMedia("(display-mode: standalone)");
  mql.addEventListener("change", callback);
  window.addEventListener("appinstalled", callback);
  return () => {
    mql.removeEventListener("change", callback);
    window.removeEventListener("appinstalled", callback);
  };
}

// `beforeinstallprompt` fires at MOST ONCE per page load, often before a
// given component has mounted — e.g. it already fired on the dashboard
// shell before the admin ever clicks through to /account. A per-component
// useState+useEffect only catches it if that exact component instance
// happened to be mounted at that moment, so every other useInstallPrompt()
// consumer (Account page vs. the banner in AppShell) silently missed it and
// only recovered on a full reload (which restarts the capture race on that
// page).
//
// Fix: capture it into a single shared store. A plain module-scope `let`
// is NOT reliable here — Next's per-route chunking can inline this small
// module separately into each route's own JS chunk rather than deduping it
// into one shared chunk, so two "module-level singletons" can silently end
// up as two different closures with two different variables (confirmed via
// a `window.__probe` test: the window object survives a client-side
// navigation, but a module-scope `let` did not carry its value across
// pages). `window` itself is the one thing guaranteed to be the same object
// regardless of how many copies of this module's code exist, so the actual
// state lives there instead.
interface PwaGlobalStore {
  deferredEvent: BeforeInstallPromptEvent | null;
  listeners: Set<() => void>;
}

declare global {
  var __mtPwaStore: PwaGlobalStore | undefined;
}

function getStore(): PwaGlobalStore {
  if (!window.__mtPwaStore) {
    const store: PwaGlobalStore = { deferredEvent: null, listeners: new Set() };
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      store.deferredEvent = e as BeforeInstallPromptEvent;
      store.listeners.forEach((cb) => cb());
    });
    window.addEventListener("appinstalled", () => {
      store.deferredEvent = null;
      store.listeners.forEach((cb) => cb());
    });
    window.__mtPwaStore = store;
  }
  return window.__mtPwaStore;
}

function subscribeDeferred(callback: () => void) {
  const { listeners } = getStore();
  listeners.add(callback);
  return () => listeners.delete(callback);
}
function getDeferredSnapshot() {
  return getStore().deferredEvent;
}
function getDeferredServerSnapshot() {
  return null;
}

/**
 * Cross-platform "install this app" state. Android/desktop-Chromium fire
 * `beforeinstallprompt`, which we capture and can trigger programmatically
 * (`promptInstall`). iOS and macOS Safari never fire that event — Apple
 * requires the manual Share/File-menu steps — so callers should show
 * instructions instead of a button when `canPrompt` is false there.
 *
 * Everything here reads via useSyncExternalStore (not effect+setState) —
 * this is all genuinely external browser state, and useSyncExternalStore is
 * the primitive that avoids both the server/client snapshot mismatch and
 * (for the deferred prompt event specifically) the mount-order race above.
 */
export function useInstallPrompt() {
  const platform = useSyncExternalStore(noopSubscribe, detectPlatform, platformServerSnapshot);
  const isStandalone = useSyncExternalStore(subscribeStandalone, isStandaloneSnapshot, isStandaloneServerSnapshot);
  const deferred = useSyncExternalStore(subscribeDeferred, getDeferredSnapshot, getDeferredServerSnapshot);

  const promptInstall = useCallback(async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    const store = getStore();
    store.deferredEvent = null;
    store.listeners.forEach((cb) => cb());
  }, [deferred]);

  return {
    platform,
    isStandalone,
    canPrompt: deferred !== null,
    promptInstall,
  };
}
