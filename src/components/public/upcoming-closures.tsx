"use client";

import { addDays, formatDayLong } from "@/lib/domain/time";
import { useLondonToday } from "@/lib/use-london-today";

/** Closed days in the next 60 days, worked out in the browser (no clock in cached code). */
export function UpcomingClosures({ closures }: { closures: { date: string; reason: string | null }[] }) {
  const today = useLondonToday();
  if (!today) return null;
  const last = addDays(today, 60);
  const upcoming = closures.filter((c) => c.date >= today && c.date <= last);
  if (upcoming.length === 0) return null;
  return (
    <div className="mt-6 rounded-2xl border border-accent/40 bg-accent/5 p-4" data-testid="upcoming-closures">
      <h3 className="font-heading font-bold">Closed on</h3>
      <ul className="mt-2 space-y-1 text-sm">
        {upcoming.map((c) => (
          <li key={c.date}>
            <span className="font-semibold">{formatDayLong(c.date)}</span>
            {c.reason && <span className="text-muted-foreground"> · {c.reason}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
