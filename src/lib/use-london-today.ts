"use client";

import { useSyncExternalStore } from "react";
import { dateKey } from "@/lib/domain/time";

/** Re-checks the date every minute (cheap; the snapshot only changes at midnight). */
function subscribe(onChange: () => void) {
  const timer = window.setInterval(onChange, 60_000);
  return () => window.clearInterval(timer);
}

/** Today's London date key in the browser; null during server rendering (never read the clock there). */
export function useLondonToday(): string | null {
  return useSyncExternalStore(subscribe, () => dateKey(new Date()), () => null);
}
