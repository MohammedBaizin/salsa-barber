"use client";

import { useEffect, useState } from "react";
import { openStatus, type WeeklyHours } from "@/lib/domain/hours";
import { cn } from "@/lib/utils";

/**
 * Live "Open now · closes 6:30pm" / "Closed · opens tomorrow 9:00am", computed in the browser in London time
 * and refreshed every minute. Renders an empty, same-height line on the server (no clock in prerendered code).
 */
export function OpenStatus({ hours, closures, className }: { hours: WeeklyHours; closures: string[]; className?: string }) {
  const [status, setStatus] = useState<ReturnType<typeof openStatus> | null>(null);

  useEffect(() => {
    const update = () => setStatus(openStatus(hours, closures, new Date()));
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, [hours, closures]);

  return (
    <p className={cn("flex min-h-6 items-center gap-2 text-sm font-semibold", className)} aria-live="polite" data-testid="open-status">
      {status && (
        <>
          <span
            aria-hidden
            className={cn(
              "inline-block size-2.5 rounded-full",
              status.open ? "bg-status-done-foreground shadow-[0_0_0_4px] shadow-status-done" : "bg-muted-foreground",
            )}
          />
          {status.label}
        </>
      )}
    </p>
  );
}
