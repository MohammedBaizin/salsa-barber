/**
 * Calendar (spec §8.3): Day / Upcoming views, a week strip, barber filter and "Show cancelled and declined".
 * The selection lives in the URL (bookmarkable, Back works). Pure, so it is unit-tested.
 */
import { addDays, dateKey, type DateKey, isDateKey, isoWeekday } from "./time";
import type { BookingStatus } from "./today";

export type CalendarView = "day" | "upcoming";

export type CalendarParams = {
  view: CalendarView;
  date: DateKey;
  barber: string | null;
  /** Show cancelled and declined bookings too. */
  all: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Reads the URL; anything unknown falls back to today / Day / everyone. */
export function parseCalendarParams(search: Record<string, string | string[] | undefined>, today: DateKey): CalendarParams {
  const date = first(search.date);
  const barber = first(search.barber);
  return {
    view: first(search.view) === "upcoming" ? "upcoming" : "day",
    date: isDateKey(date) ? date : today,
    barber: barber && UUID.test(barber) ? barber : null,
    all: first(search.all) === "1",
  };
}

/** The URL for a calendar state (defaults are left out, so "today, Day view, everyone" is just /dashboard/calendar). */
export function calendarHref(p: CalendarParams, today: DateKey): string {
  const q = new URLSearchParams();
  if (p.view === "upcoming") q.set("view", "upcoming");
  else if (p.date !== today) q.set("date", p.date);
  if (p.barber) q.set("barber", p.barber);
  if (p.all) q.set("all", "1");
  const s = q.toString();
  return s ? `/dashboard/calendar?${s}` : "/dashboard/calendar";
}

/** Monday to Sunday of the week containing `date`. */
export function weekOf(date: DateKey): DateKey[] {
  const monday = addDays(date, 1 - isoWeekday(date));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** Statuses listed: live ones, plus cancelled/declined when the switch is on. */
export function visibleStatuses(all: boolean): BookingStatus[] {
  const base: BookingStatus[] = ["pending", "confirmed", "completed", "no_show"];
  return all ? [...base, "cancelled", "declined"] : base;
}

/** Bookings per London day (only the statuses being shown). */
export function countByDay(bookings: { startsAt: Date; status: BookingStatus }[], all: boolean): Map<DateKey, number> {
  const shown = visibleStatuses(all);
  const counts = new Map<DateKey, number>();
  for (const b of bookings) {
    if (!shown.includes(b.status)) continue;
    const key = dateKey(b.startsAt);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** "3 bookings" / "1 booking" / "No bookings" (week strip, for screen readers too). */
export function bookingCountLabel(n: number): string {
  if (n === 0) return "No bookings";
  return n === 1 ? "1 booking" : `${n} bookings`;
}

/** Upcoming list: grouped by London day, in time order. */
export function groupByDay<T extends { startsAt: Date }>(bookings: T[]): { day: DateKey; bookings: T[] }[] {
  const sorted = [...bookings].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const groups: { day: DateKey; bookings: T[] }[] = [];
  for (const b of sorted) {
    const day = dateKey(b.startsAt);
    const last = groups.at(-1);
    if (last?.day === day) last.bookings.push(b);
    else groups.push({ day, bookings: [b] });
  }
  return groups;
}

/**
 * Desktop barber columns: every bookable barber in staff order, plus anyone else who has a booking that day
 * (e.g. someone no longer taking bookings).
 */
export function barberColumns(
  barbers: { id: string; name: string }[],
  bookings: { staffId: string; staffName: string }[],
): { id: string; name: string }[] {
  const cols = [...barbers];
  for (const b of bookings) {
    if (!cols.some((c) => c.id === b.staffId)) cols.push({ id: b.staffId, name: b.staffName });
  }
  return cols;
}
