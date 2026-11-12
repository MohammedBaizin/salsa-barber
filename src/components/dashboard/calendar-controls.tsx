"use client";

import { useOptimistic, useTransition, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { bookingCountLabel, calendarHref, weekOf, type CalendarParams } from "@/lib/domain/calendar";
import type { BarberOption } from "@/lib/dashboard/types";
import { addDays, dayShortName, formatDay, isoWeekday } from "@/lib/domain/time";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
import { cn } from "@/lib/utils";

const pill = "inline-flex min-h-11 shrink-0 items-center rounded-full border-2 px-4 text-sm font-semibold whitespace-nowrap transition-colors";
const pillOn = "border-foreground bg-secondary text-secondary-foreground";
const pillOff = "border-input hover:bg-muted";

/**
 * Calendar controls: Day/Upcoming, week strip, barber filter, "Show cancelled and declined".
 * Links work without JavaScript; with it, the choice highlights at once (useOptimistic) while the page loads.
 */
export function CalendarControls({
  params,
  today,
  counts,
  barbers,
  children,
}: {
  params: CalendarParams;
  today: string;
  /** Bookings per day of the shown week. */
  counts: Record<string, number>;
  /** Filter choices (owner/admin); empty for barbers. */
  barbers: BarberOption[];
  children: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [p, setOptimistic] = useOptimistic(params);

  const link = (next: Partial<CalendarParams>) => {
    const target = { ...p, ...next };
    return {
      href: calendarHref(target, today),
      onClick: (e: MouseEvent<HTMLAnchorElement>) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        startTransition(() => {
          setOptimistic(target);
          router.push(calendarHref(target, today), { scroll: false });
        });
      },
    };
  };

  const week = weekOf(p.date);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <nav aria-label="Calendar view" className="inline-flex rounded-full border-2 border-input p-1">
          {(["day", "upcoming"] as const).map((v) => (
            <Link
              key={v}
              {...link({ view: v })}
              aria-current={p.view === v ? "page" : undefined}
              className={cn(
                "inline-flex min-h-9 items-center rounded-full px-4 text-sm font-semibold",
                p.view === v ? "bg-secondary text-secondary-foreground" : "hover:bg-muted",
              )}
            >
              {v === "day" ? "Day" : "Upcoming"}
            </Link>
          ))}
        </nav>
        <Link
          {...link({ all: !p.all })}
          role="switch"
          aria-checked={p.all}
          className="inline-flex min-h-11 items-center gap-2 rounded-full px-1 text-sm font-medium"
        >
          <span
            aria-hidden
            className={cn(
              "relative inline-block h-6 w-10 rounded-full border-2 transition-colors",
              p.all ? "border-foreground bg-secondary" : "border-input bg-card",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 size-4 rounded-full transition-[left]",
                p.all ? "left-[1.1rem] bg-secondary-foreground" : "left-0.5 bg-input",
              )}
            />
          </span>
          Show cancelled and declined
        </Link>
      </div>

      {barbers.length > 1 ? (
        <nav aria-label="Barber" className="flex flex-wrap gap-2">
          {[{ id: null, name: "Everyone" }, ...barbers].map((b) => (
            <Link
              key={b.id ?? "all"}
              {...link({ barber: b.id })}
              aria-current={p.barber === b.id ? "true" : undefined}
              className={cn(pill, p.barber === b.id ? pillOn : pillOff)}
            >
              {b.name}
            </Link>
          ))}
        </nav>
      ) : null}

      {p.view === "day" ? (
        <div className="space-y-2">
          <div className="flex items-center gap-1">
            <Link
              {...link({ date: addDays(p.date, -7) })}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-muted"
            >
              <ChevronLeft aria-hidden className="size-5" />
              <span className="sr-only">Previous week</span>
            </Link>
            <ol className="grid flex-1 grid-cols-7 gap-1" aria-label={`Week of ${formatDay(week[0])}`}>
              {week.map((day) => {
                const n = counts[day] ?? 0;
                const selected = day === p.date;
                return (
                  <li key={day}>
                    <Link
                      {...link({ date: day })}
                      aria-current={selected ? "date" : undefined}
                      data-testid={`day-${day}`}
                      className={cn(
                        "flex min-h-16 flex-col items-center justify-center rounded-xl border-2 px-0.5 py-1 text-center transition-colors",
                        selected ? "border-foreground bg-secondary text-secondary-foreground" : "border-transparent hover:bg-muted",
                        day === today && !selected && "border-input",
                      )}
                    >
                      {/* Spoken: "Mon 9 November (today): 2 bookings" (keeps the visible text in the name). */}
                      <span className="text-xs font-medium">{dayShortName(isoWeekday(day))}</span>
                      <span className="text-lg leading-tight font-bold tabular-nums">
                        {Number(day.slice(8))}
                        <span className="sr-only">
                          {` ${MONTHS[Number(day.slice(5, 7)) - 1]}${day === today ? " (today)" : ""}: ${bookingCountLabel(n)}`}
                        </span>
                      </span>
                      <span className="flex h-4 items-center gap-0.5 text-xs font-semibold tabular-nums" aria-hidden>
                        {n > 0 ? (
                          <>
                            <span className={cn("size-1.5 rounded-full", selected ? "bg-primary" : "bg-foreground")} />
                            {n}
                          </>
                        ) : null}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
            <Link
              {...link({ date: addDays(p.date, 7) })}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-muted"
            >
              <ChevronRight aria-hidden className="size-5" />
              <span className="sr-only">Next week</span>
            </Link>
          </div>
          {p.date !== today ? (
            <Link {...link({ date: today })} className="inline-flex min-h-11 items-center text-link underline underline-offset-4 hover:no-underline">
              Back to today
            </Link>
          ) : null}
        </div>
      ) : null}

      <div aria-busy={pending || undefined} className={cn("transition-opacity", pending && "opacity-60")}>
        {children}
      </div>
    </div>
  );
}
