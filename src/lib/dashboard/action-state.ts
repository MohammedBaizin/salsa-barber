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
