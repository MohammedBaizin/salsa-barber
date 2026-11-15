"use client";

import { useEffect, useState } from "react";
import { openStatus, type WeeklyHours } from "@/lib/domain/hours";
import { cn } from "@/lib/utils";

/**
 * Live "Open now · closes 6:30pm" / "Closed · opens tomorrow 9:00am" pill, computed in the browser in London time
 * and refreshed every minute. Renders an empty, same-height line on the server (no clock in prerendered code).
 */
export function OpenStatus({
  hours,
  closures,
  className,
  size = "md",
}: {
  hours: WeeklyHours;
  closures: string[];
  className?: string;
  /** `sm`: the small glass pill laid over the hero photo. */
  size?: "sm" | "md";
}) {
  const sm = size === "sm";
  const [status, setStatus] = useState<ReturnType<typeof openStatus> | null>(null);

  useEffect(() => {
    const update = () => setStatus(openStatus(hours, closures, new Date()));
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, [hours, closures]);

  return (
    <p
      className={cn("flex items-center font-semibold", sm ? "min-h-7 text-[0.6875rem]" : "min-h-9 text-sm", className)}
      aria-live="polite"
      data-testid="open-status"
    >
      {status && (
        <span
          className={cn(
            "inline-flex items-center rounded-full border whitespace-nowrap",
            sm ? "glass h-7 gap-2 border-white/15 px-2.5 text-white/90" : "min-h-9 gap-2.5 border-border bg-card/70 px-4",
          )}
        >
          <span
            aria-hidden
            className={cn(
              cn("inline-block shrink-0 rounded-full", sm ? "size-1.5" : "size-2"),
              status.open ? "live-dot bg-status-done-foreground text-status-done-foreground" : "bg-muted-foreground",
            )}
          />
          {status.label}
        </span>
      )}
    </p>
  );
}
