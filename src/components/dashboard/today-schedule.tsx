"use client";

import { useState } from "react";
import type { BarberOption, DashboardBooking } from "@/lib/dashboard/types";
import { withDates } from "@/lib/dashboard/types";
import { formatTime } from "@/lib/domain/time";
import { scheduleWithNow } from "@/lib/domain/today";
import { cn } from "@/lib/utils";
import { BookingCard } from "./booking-card";

/**
 * Today's schedule in time order with a "now" line; owner/admin can filter by barber (instant, in the browser).
 */
export function TodaySchedule({
  bookings,
  barbers,
  now,
  today,
}: {
  bookings: DashboardBooking[];
  /** Empty for barbers (they only see their own bookings). */
  barbers: BarberOption[];
  now: string;
  today: string;
}) {
  const [barber, setBarber] = useState<string | null>(null);
  const nowDate = new Date(now);
  const byId = new Map(bookings.map((b) => [b.id, b]));
  const items = scheduleWithNow(bookings.map(withDates), nowDate, { day: today, staffId: barber });
  const hasBookings = items.some((i) => i.kind === "booking");

  return (
    <div>
      {barbers.length > 1 ? (
        <div role="group" aria-label="Show bookings for" className="mb-3 flex flex-wrap gap-2">
          {[{ id: null, name: "Everyone" }, ...barbers].map((b) => (
            <button
              key={b.id ?? "all"}
              type="button"
              aria-pressed={barber === b.id}
              onClick={() => setBarber(b.id)}
              className={cn(
                "min-h-11 shrink-0 rounded-full border-2 px-4 text-sm font-semibold whitespace-nowrap transition-colors",
                barber === b.id ? "border-foreground bg-secondary text-secondary-foreground" : "border-input hover:bg-muted",
              )}
            >
              {b.name}
            </button>
          ))}
        </div>
      ) : null}

      {hasBookings ? (
        <ol className="space-y-2" data-testid="schedule">
          {items.map((item) =>
            item.kind === "now" ? (
              <li key="now" className="flex items-center gap-2 py-1 text-sm font-semibold text-destructive" data-testid="now-line">
                <span>Now · {formatTime(nowDate)}</span>
                <span aria-hidden className="h-0.5 flex-1 rounded-full bg-destructive" />
              </li>
            ) : (
              <li key={item.booking.id}>
                <BookingCard booking={byId.get(item.booking.id)!} today={today} />
              </li>
            ),
          )}
        </ol>
      ) : (
        <p className="rounded-xl border border-dashed p-4 text-muted-foreground">
          {barber ? "No bookings for this barber today." : "No bookings today yet."}
        </p>
      )}
    </div>
  );
}
