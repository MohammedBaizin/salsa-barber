/**
 * Staff-chosen times (walk-ins, phone bookings, reschedules): warnings, never blocks (spec §5.5).
 * Overlaps are always refused by the database. The buttons then read "Book anyway / Save anyway / Move anyway".
 */
import { fitsHours, windowFor, type WeeklyHours } from "./hours";
import { addDays, dateKey, type DateKey, formatDay, isoWeekday, minuteOfDay } from "./time";

export const STAFF_GRID_MINUTES = 5;

export type ScheduleWarning = { code: "closed_day" | "outside_shop_hours" | "outside_barber_hours" | "time_off"; message: string };

export function scheduleWarnings(opts: {
  start: Date;
  durationMin: number;
  shopHours: WeeklyHours;
  closures: DateKey[];
  barberName: string;
  barberHours: WeeklyHours;
  timeOff: { startsOn: DateKey; endsOn: DateKey }[];
}): ScheduleWarning[] {
  const end = new Date(opts.start.getTime() + opts.durationMin * 60_000);
  const key = dateKey(opts.start);
  const out: ScheduleWarning[] = [];

  if (opts.closures.includes(key) || !windowFor(opts.shopHours, isoWeekday(key))) {
    out.push({ code: "closed_day", message: `The shop is closed on ${formatDay(key)}.` });
  } else if (!fitsHours(opts.shopHours, opts.start, end)) {
    out.push({ code: "outside_shop_hours", message: "This is outside opening hours." });
  }
  if (opts.timeOff.some((t) => t.startsOn <= key && key <= t.endsOn)) {
    out.push({ code: "time_off", message: `${opts.barberName} is off on ${formatDay(key)}.` });
  } else if (!fitsHours(opts.barberHours, opts.start, end)) {
    out.push({ code: "outside_barber_hours", message: `This is outside ${opts.barberName}'s working hours.` });
  }
  return out;
}

export type StaffTimeKind = "walk_in" | "phone" | "reschedule";

export type StaffTimeProblem = "not_on_grid" | "walk_in_window" | "in_the_past" | "too_far";

export const STAFF_TIME_MESSAGES: Record<StaffTimeProblem, string> = {
  not_on_grid: "Please choose a time on a 5-minute step.",
  walk_in_window: "Walk-ins can be added from a week ago up to tomorrow.",
  in_the_past: "Please choose a time in the future.",
  too_far: "Please choose a date within the next year.",
};

/**
 * Time rules for staff-created bookings:
 * - walk-in: 5-minute grid, from 7 days ago to the end of tomorrow (London);
 * - phone booking and reschedule: 5-minute grid, in the future, up to a year ahead.
 */
export function checkStaffTime(kind: StaffTimeKind, start: Date, now: Date): StaffTimeProblem | null {
  if (minuteOfDay(start) % STAFF_GRID_MINUTES !== 0 || start.getUTCSeconds() !== 0 || start.getUTCMilliseconds() !== 0) {
    return "not_on_grid";
  }
  const key = dateKey(start);
  const today = dateKey(now);
  if (kind === "walk_in") {
    return key < addDays(today, -7) || key > addDays(today, 1) ? "walk_in_window" : null;
  }
  if (start <= now) return "in_the_past";
  if (key > addDays(today, 365)) return "too_far";
  return null;
}

/** Button label when there are warnings. */
export function anywayLabel(kind: StaffTimeKind, hasWarnings: boolean): string {
  const base = kind === "reschedule" ? "Move" : kind === "walk_in" ? "Add walk-in" : "Book";
  if (!hasWarnings) return base;
  return kind === "reschedule" ? "Move anyway" : kind === "walk_in" ? "Save anyway" : "Book anyway";
}
