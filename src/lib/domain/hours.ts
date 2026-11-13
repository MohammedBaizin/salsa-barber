/**
 * Weekly opening hours: keys "1".."7" (ISO weekday, 1 = Monday), value {open, close} ("HH:MM") or null.
 * Missing or null days are closed. Mirrors app.fits_hours() in SQL; the validation schema (app.valid_weekly_hours())
 * is in hours-schema.ts, so the public website's "Open now" doesn't ship zod to the browser.
 */
import {
  addDays, dateKey, type DateKey, dayShortName, formatClock, formatDay, fromLondon, isoWeekday, minuteOfDay, parseHHMM, toHHMM,
} from "./time";

export type DayHours = { open: string; close: string } | null;
export type WeeklyHours = Partial<Record<"1" | "2" | "3" | "4" | "5" | "6" | "7", DayHours>>;

export const WEEKDAYS = ["1", "2", "3", "4", "5", "6", "7"] as const;

/** Opening window for an ISO weekday in minutes, or null when closed. */
export function windowFor(hours: WeeklyHours, isoDay: number): { open: number; close: number } | null {
  const day = hours[String(isoDay) as keyof WeeklyHours];
  if (!day) return null;
  return { open: parseHHMM(day.open), close: parseHHMM(day.close) };
}

/** [start, end) inside that London day's window. Mirrors app.fits_hours(). */
export function fitsHours(hours: WeeklyHours, start: Date, end: Date): boolean {
  if (end <= start) return false;
  const key = dateKey(start);
  if (dateKey(end) !== key) return false;
  const w = windowFor(hours, isoWeekday(key));
  if (!w) return false;
  return minuteOfDay(start) >= w.open && minuteOfDay(end) <= w.close;
}

/** "9:00am–6:00pm" */
export function formatWindow(day: DayHours): string {
  if (!day) return "Closed";
  return `${formatClock(parseHHMM(day.open))}–${formatClock(parseHHMM(day.close))}`;
}

/** Consecutive days with the same hours grouped: [{ days: "Mon–Fri", hours: "9:00am–6:00pm" }, …]. */
export function groupWeeklyHours(hours: WeeklyHours): { days: string; hours: string; closed: boolean }[] {
  const groups: { from: number; to: number; text: string }[] = [];
  for (let d = 1; d <= 7; d++) {
    const text = formatWindow(hours[String(d) as keyof WeeklyHours] ?? null);
    const last = groups.at(-1);
    if (last && last.text === text && last.to === d - 1) last.to = d;
    else groups.push({ from: d, to: d, text });
  }
  return groups.map((g) => ({
    days:
      g.from === g.to
        ? dayShortName(g.from)
        : g.to === g.from + 1
          ? `${dayShortName(g.from)} & ${dayShortName(g.to)}`
          : `${dayShortName(g.from)}–${dayShortName(g.to)}`,
    hours: g.text,
    closed: g.text === "Closed",
  }));
}

export function hasAnyHours(hours: WeeklyHours): boolean {
  return WEEKDAYS.some((d) => hours[d]);
}

export type OpenStatus =
  | { open: true; closesAt: Date; label: string }
  | { open: false; nextOpen: Date | null; label: string };

/**
 * Live "Open now / Closed" for the homepage. Runs in the browser (never in cached code).
 * Looks up to 14 days ahead for the next opening, skipping closed days.
 */
export function openStatus(hours: WeeklyHours, closures: ReadonlySet<DateKey> | DateKey[], now: Date): OpenStatus {
  const closed = closures instanceof Set ? closures : new Set(closures);
  const today = dateKey(now);
  const nowMin = minuteOfDay(now);

  const todayWindow = closed.has(today) ? null : windowFor(hours, isoWeekday(today));
  if (todayWindow && nowMin >= todayWindow.open && nowMin < todayWindow.close) {
    return { open: true, closesAt: fromLondon(today, todayWindow.close), label: `Open now · closes ${formatClock(todayWindow.close)}` };
  }

  for (let i = 0; i <= 14; i++) {
    const key = addDays(today, i);
    if (closed.has(key)) continue;
    const w = windowFor(hours, isoWeekday(key));
    if (!w || (i === 0 && nowMin >= w.open)) continue;
    const when = i === 0 ? formatClock(w.open) : i === 1 ? `tomorrow ${formatClock(w.open)}` : `${formatDay(key)} ${formatClock(w.open)}`;
    return { open: false, nextOpen: fromLondon(key, w.open), label: `Closed · opens ${when}` };
  }
  return { open: false, nextOpen: null, label: "Closed" };
}

// ---------------------------------------------------------------------------
// Weekly hours form (shared by Team schedules and the shop's opening hours in Settings)
// Fields per day: day_<n>_on ("on"), day_<n>_open and day_<n>_close (minutes after midnight).
// ---------------------------------------------------------------------------

export type HoursFormResult = { ok: true; hours: WeeklyHours } | { ok: false; errors: Record<string, string> };

export const HOURS_ORDER_ERROR = "Finish time must be after the start time.";

export function parseHoursForm(get: (name: string) => string | null): HoursFormResult {
  const hours: WeeklyHours = {};
  const errors: Record<string, string> = {};
  for (const d of WEEKDAYS) {
    if (get(`day_${d}_on`) !== "on") {
      hours[d] = null;
      continue;
    }
    const open = Number(get(`day_${d}_open`));
    const close = Number(get(`day_${d}_close`));
    const valid = (m: number) => Number.isInteger(m) && m >= 0 && m < 24 * 60 && m % 5 === 0;
    if (!valid(open) || !valid(close)) {
      errors[`day_${d}`] = "Please choose a start and finish time.";
    } else if (close <= open) {
      errors[`day_${d}`] = HOURS_ORDER_ERROR;
    } else {
      hours[d] = { open: toHHMM(open), close: toHHMM(close) };
    }
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, hours };
}

/** Form values for each weekday (closed days default to 9:00am–5:00pm when switched on). */
export function hoursFormValues(hours: WeeklyHours): { day: (typeof WEEKDAYS)[number]; on: boolean; open: number; close: number }[] {
  return WEEKDAYS.map((d) => {
    const h = hours[d];
    return h ? { day: d, on: true, open: parseHHMM(h.open), close: parseHHMM(h.close) } : { day: d, on: false, open: 540, close: 1020 };
  });
}
