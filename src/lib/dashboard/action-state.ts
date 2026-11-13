import type { MessagePlan } from "@/lib/domain/staff-bookings";
import type { ScheduleWarning } from "@/lib/domain/schedule";
import type { DashboardBooking } from "./types";

/** Answer from every staff booking action (src/app/(staff)/dashboard/booking-actions.ts). */
export type BookingActionState = {
  error: string | null;
  fields: Record<string, string>;
  /** Schedule warnings: the form asks to confirm ("Move anyway"). */
  warnings: ScheduleWarning[];
  done: { booking: DashboardBooking; message: MessagePlan | null; notice: string } | null;
  attempt: number;
};

export const initialBookingActionState: BookingActionState = { error: null, fields: {}, warnings: [], done: null, attempt: 0 };

/** Answer from the dashboard's save forms (Team, Settings): field errors, a warning to confirm, or a notice. */
export type SaveState = {
  error: string | null;
  fields: Record<string, string>;
  /** Asks to confirm ("Save anyway", "Add anyway"…). */
  warning: string | null;
  done: { notice: string; password?: string; id?: string } | null;
  attempt: number;
};

export const initialSaveState: SaveState = { error: null, fields: {}, warning: null, done: null, attempt: 0 };

/** The next answer: everything cleared except what's given, attempt counted up. */
export function nextSaveState(prev: SaveState, next: Partial<SaveState>): SaveState {
  return { error: null, fields: {}, warning: null, done: null, ...next, attempt: prev.attempt + 1 };
}
