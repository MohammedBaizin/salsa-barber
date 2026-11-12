/**
 * Free start times for customers (spec §5.1). Pure: the caller loads the data.
 * Mirrored in SQL inside request_booking() (phase 5) with a parity test.
 *
 * Rules:
 * - 15-minute grid in London wall-clock time; the whole service must fit.
 * - Inside shop hours AND the barber's weekly hours for that day.
 * - Not on a shop closure, not in the barber's time off, no overlap with pending/confirmed bookings.
 * - At least `minNoticeMinutes` from now; on or before the last day of the booking window
 *   (window 1 = today only, 30 = today + 29 days).
 * - "Any barber": a time is offered when at least one eligible barber is free.
 */
import { fitsHours, windowFor, type WeeklyHours } from "./hours";
import { addDays, dateKey, type DateKey, daysBetween, fromLondon, isoWeekday, minuteOfDay } from "./time";

export const SLOT_STEP_MINUTES = 15;

export type AvailabilityBarber = {
  id: string;
  sort: number;
  weeklyHours: WeeklyHours;
  /** Inclusive whole-day ranges. */
  timeOff: { startsOn: DateKey; endsOn: DateKey }[];
};

export type BusyBooking = { id?: string; staffId: string; startsAt: Date; endsAt: Date };

export type AvailabilityInput = {
  now: Date;
  durationMin: number;
  shopHours: WeeklyHours;
  closures: DateKey[];
  /** Barbers who are bookable, active and offer the service (already filtered by the caller). */
  barbers: AvailabilityBarber[];
  /** Pending and confirmed bookings. */
  bookings: BusyBooking[];
  minNoticeMinutes: number;
  bookingWindowDays: number;
  /** Booking being changed by the customer: its own slot counts as free. */
  ignoreBookingId?: string | null;
};

export type DaySlots = { date: DateKey; times: { start: Date; barberIds: string[] }[] };

/** Last bookable London date for the window. */
export function lastBookableDate(now: Date, bookingWindowDays: number): DateKey {
  return addDays(dateKey(now), Math.max(1, bookingWindowDays) - 1);
}

/** Does this booking still block time? (The customer's own booking doesn't when they change it.) */
function blocks(input: AvailabilityInput, b: BusyBooking): boolean {
  return input.ignoreBookingId == null || b.id !== input.ignoreBookingId;
}

export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function onTimeOff(barber: AvailabilityBarber, key: DateKey): boolean {
  return barber.timeOff.some((t) => t.startsOn <= key && key <= t.endsOn);
}

/** Why a specific start can't be booked with a barber (null = free). Codes match request_booking() errors. */
export type SlotProblem = "invalid_time" | "too_soon" | "too_far" | "shop_closed" | "outside_hours" | "barber_unavailable" | "slot_taken";

export function checkSlot(input: AvailabilityInput, barber: AvailabilityBarber, start: Date): SlotProblem | null {
  const end = new Date(start.getTime() + input.durationMin * 60_000);
  const key = dateKey(start);
  if (minuteOfDay(start) % SLOT_STEP_MINUTES !== 0 || start.getUTCSeconds() !== 0 || start.getUTCMilliseconds() !== 0) {
    return "invalid_time";
  }
  if (start.getTime() < input.now.getTime() + input.minNoticeMinutes * 60_000) return "too_soon";
  if (key > lastBookableDate(input.now, input.bookingWindowDays)) return "too_far";
  if (input.closures.includes(key) || !windowFor(input.shopHours, isoWeekday(key))) return "shop_closed";
  if (!fitsHours(input.shopHours, start, end)) return "outside_hours";
  if (onTimeOff(barber, key) || !fitsHours(barber.weeklyHours, start, end)) return "barber_unavailable";
  const busy = input.bookings.some(
    (b) => b.staffId === barber.id && blocks(input, b) && overlaps(start, end, b.startsAt, b.endsAt),
  );
  return busy ? "slot_taken" : null;
}

/** Every free start time in the booking window, grouped by London day (days with no times included, empty). */
export function availableSlots(input: AvailabilityInput): DaySlots[] {
  const today = dateKey(input.now);
  const last = lastBookableDate(input.now, input.bookingWindowDays);
  const closures = new Set(input.closures);
  const days: DaySlots[] = [];

  for (let i = 0; i <= daysBetween(today, last); i++) {
    const key = addDays(today, i);
    const day: DaySlots = { date: key, times: [] };
    days.push(day);
    const shop = windowFor(input.shopHours, isoWeekday(key));
    if (!shop || closures.has(key)) continue;

    const byStart = new Map<number, string[]>();
    for (const barber of input.barbers) {
      const own = windowFor(barber.weeklyHours, isoWeekday(key));
      if (!own || onTimeOff(barber, key)) continue;
      const open = Math.max(shop.open, own.open);
      const close = Math.min(shop.close, own.close);
      const first = Math.ceil(open / SLOT_STEP_MINUTES) * SLOT_STEP_MINUTES;
      for (let m = first; m + input.durationMin <= close; m += SLOT_STEP_MINUTES) {
        const start = fromLondon(key, m);
        if (checkSlot(input, barber, start) === null) {
          const list = byStart.get(start.getTime()) ?? [];
          list.push(barber.id);
          byStart.set(start.getTime(), list);
        }
      }
    }
    day.times = [...byStart.entries()]
      .sort(([a], [b]) => a - b)
      .map(([t, barberIds]) => ({ start: new Date(t), barberIds }));
  }
  return days;
}

/**
 * "Any barber" choice for a start time (the database makes the real choice in request_booking()):
 * 1. earliest free: the barber who has been free longest before this start
 *    (end of their last booking that day, or their opening time if none),
 * 2. then fewest bookings that day,
 * 3. then staff sort order.
 */
export function chooseBarber(input: AvailabilityInput, start: Date): string | null {
  const key = dateKey(start);
  const candidates = input.barbers
    .filter((b) => checkSlot(input, b, start) === null)
    .map((b) => {
      const sameDay = input.bookings.filter(
        (x) => x.staffId === b.id && blocks(input, x) && dateKey(x.startsAt) === key,
      );
      const before = sameDay.filter((x) => x.endsAt <= start).map((x) => x.endsAt.getTime());
      const own = windowFor(b.weeklyHours, isoWeekday(key))!;
      const shop = windowFor(input.shopHours, isoWeekday(key))!;
      const opening = fromLondon(key, Math.max(own.open, shop.open)).getTime();
      return { id: b.id, sort: b.sort, freeSince: before.length ? Math.max(...before) : opening, count: sameDay.length };
    })
    .sort((a, b) => a.freeSince - b.freeSince || a.count - b.count || a.sort - b.sort);
  return candidates[0]?.id ?? null;
}

/** Times grouped for the picker: Morning (before 12), Afternoon (12–5pm), Evening (5pm on). */
export function groupByPartOfDay<T extends { start: Date }>(times: T[]) {
  const groups = { morning: [] as T[], afternoon: [] as T[], evening: [] as T[] };
  for (const t of times) {
    const m = minuteOfDay(t.start);
    (m < 12 * 60 ? groups.morning : m < 17 * 60 ? groups.afternoon : groups.evening).push(t);
  }
  return groups;
}
