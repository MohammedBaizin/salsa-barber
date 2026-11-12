"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SHEET_CLOSED_EVENT } from "./sheet";

export const REFRESH_MS = 60_000;

/** Paused while the page is hidden, the device is offline, or a sheet is open. */
function paused(): boolean {
  return document.visibilityState !== "visible" || navigator.onLine === false || document.querySelector("dialog[open]") !== null;
}

/**
 * Re-renders the dashboard's server data every 60 s while visible (spec §8.1).
 * A refresh that was skipped (hidden, offline, sheet open) happens once as soon as that ends.
 * router.refresh() keeps client state (open filters, scroll position).
 */
export function AutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    let missed = false;
    const tick = () => {
      if (paused()) {
        missed = true;
        return;
      }
      missed = false;
      router.refresh();
    };
    const catchUp = () => {
      if (missed && !paused()) tick();
    };
    const timer = window.setInterval(tick, REFRESH_MS);
    document.addEventListener("visibilitychange", catchUp);
    window.addEventListener("online", catchUp);
    window.addEventListener(SHEET_CLOSED_EVENT, catchUp);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", catchUp);
      window.removeEventListener("online", catchUp);
      window.removeEventListener(SHEET_CLOSED_EVENT, catchUp);
    };
  }, [router]);

  return null;
}
