/**
 * Booking actions and the Today screen's logic.
 * availableActions() mirrors the status machine in app.bookings_before_write() plus the §7 permissions.
 */
import type { Role } from "./team";
import { formatMinutes, londonParts } from "./time";

export type BookingStatus = "pending" | "confirmed" | "declined" | "cancelled" | "completed" | "no_show";
export type BookingSource = "online" | "walk_in" | "staff";

export const LIVE_STATUSES: readonly BookingStatus[] = ["pending", "confirmed"];

/** Allowed status changes (same as the database trigger). */
export const STATUS_TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  pending: ["confirmed", "declined", "cancelled"],
  confirmed: ["completed", "no_show", "cancelled"],
  completed: ["confirmed"],
  no_show: ["confirmed"],
  declined: [],
  cancelled: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return STATUS_TRANSITIONS[from].includes(to);
}

export const STATUS_LABELS: Record<BookingStatus, string> = {
  pending: "Request",
  confirmed: "Confirmed",
  declined: "Declined",
  cancelled: "Cancelled",
  completed: "Done",
  no_show: "No-show",
};

export type BookingAction =
  | "accept"
  | "decline"
  | "done"
  | "no_show"
  | "cancel"
  | "undo"
  | "message"
  | "reschedule"
  | "change_barber"
  | "change_service";

export type ActionBooking = {
  status: BookingStatus;
  staffId: string;
  startsAt: Date;
  endsAt: Date;
  createdAt: Date;
  /** Client has a phone number to message. */
  hasPhone: boolean;
};

export type Actor = { staffId: string; role: Role };

const PENDING_STALE_MS = 12 * 60 * 60_000;

/** Pending request older than 12 hours (highlighted). */
export function isStale(b: Pick<ActionBooking, "status" | "createdAt">, now: Date): boolean {
  return b.status === "pending" && now.getTime() - b.createdAt.getTime() > PENDING_STALE_MS;
}

/** Pending request whose time has passed: can only be declined. */
export function isExpired(b: Pick<ActionBooking, "status" | "startsAt">, now: Date): boolean {
  return b.status === "pending" && b.startsAt <= now;
}

export function hasStarted(b: Pick<ActionBooking, "startsAt">, now: Date): boolean {
  return b.startsAt <= now;
}

/** Every action this person may take on this booking right now, in display order. */
export function availableActions(b: ActionBooking, actor: Actor, now: Date): BookingAction[] {
  const manager = actor.role === "owner" || actor.role === "admin";
  if (!manager && b.staffId !== actor.staffId) return [];
  const started = hasStarted(b, now);
  const out: BookingAction[] = [];

  switch (b.status) {
    case "pending":
      if (started) return ["decline"];
      out.push("accept", "decline", "reschedule");
      if (manager) out.push("change_barber", "change_service");
      break;
    case "confirmed":
      if (started) out.push("done", "no_show");
      if (b.hasPhone) out.push("message");
      out.push("reschedule");
      if (manager) out.push("change_barber", "change_service");
      out.push("cancel");
      break;
    case "completed":
      out.push("undo");
      if (manager) out.push("change_service");
      break;
    case "no_show":
      out.push("undo");
      break;
    case "declined":
    case "cancelled":
      if (b.hasPhone) out.push("message");
      break;
  }
  return out;
}

/** The one button on a booking card: Accept, or Done once started. */
export function primaryAction(b: ActionBooking, actor: Actor, now: Date): "accept" | "done" | null {
  const actions = availableActions(b, actor, now);
  if (actions.includes("accept")) return "accept";
  if (actions.includes("done")) return "done";
  return null;
}

/** Confirmed bookings that have ended but weren't marked Done or No-show. */
export function needsClosing<T extends Pick<ActionBooking, "status" | "endsAt">>(bookings: T[], now: Date): T[] {
  return bookings.filter((b) => b.status === "confirmed" && b.endsAt <= now);
}

/** "Now" while in progress, otherwise "in 25 min" / "in 1 hr 5 min"; null once ended. */
export function untilLabel(b: Pick<ActionBooking, "startsAt" | "endsAt">, now: Date): string | null {
  if (b.endsAt <= now) return null;
  if (b.startsAt <= now) return "Now";
  return `in ${formatMinutes(Math.ceil((b.startsAt.getTime() - now.getTime()) / 60_000))}`;
}

/** Next up: in-progress and upcoming confirmed bookings, soonest first. */
export function nextUp<T extends Pick<ActionBooking, "status" | "startsAt" | "endsAt">>(bookings: T[], now: Date, limit = 3): T[] {
  return bookings
    .filter((b) => b.status === "confirmed" && b.endsAt > now)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .slice(0, limit);
}

/** "Good morning" / "Good afternoon" / "Good evening" in London time. */
export function greeting(now: Date): string {
  const { hour } = londonParts(now);
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** Today's numbers. `taken` = completed revenue; `expected` = completed + confirmed. */
export function todayStats(bookings: { status: BookingStatus; pricePence: number; startsAt: Date }[], now: Date) {
  const live = bookings.filter((b) => b.status === "confirmed" || b.status === "completed");
  return {
    bookings: live.length,
    takenPence: bookings.filter((b) => b.status === "completed").reduce((s, b) => s + b.pricePence, 0),
    expectedPence: live.reduce((s, b) => s + b.pricePence, 0),
    upcoming: bookings.filter((b) => b.status === "confirmed" && b.startsAt > now).length,
  };
}
