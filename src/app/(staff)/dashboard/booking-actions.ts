"use server";

import { refresh } from "next/cache";
import { requireStaff, type Staff } from "@/lib/auth/staff";
import { BOOKING_COLUMNS, toBooking, type Supabase } from "@/lib/dashboard/bookings";
import { initialBookingActionState, type BookingActionState } from "@/lib/dashboard/action-state";
import { warningsFor } from "@/lib/dashboard/setup";
import { withDates, type DashboardBooking } from "@/lib/dashboard/types";
import { formatPence, parsePounds } from "@/lib/domain/money";
import { checkStaffTime, STAFF_TIME_MESSAGES } from "@/lib/domain/schedule";
import {
  changeBarberSchema, changeServiceSchema, newBookingSchema, NOT_ALLOWED_ERROR, planForStatus, rescheduleSchema, STALE_ERROR,
  staffErrorMessage, statusActionSchema, type MessagePlan, type StatusAction,
} from "@/lib/domain/staff-bookings";
import { isManager } from "@/lib/domain/team";
import { formatDateTime, fromLondon } from "@/lib/domain/time";
import { availableActions, type BookingAction } from "@/lib/domain/today";
import { fieldErrors, GENERIC_ERROR } from "@/lib/domain/validation";
import { createSessionClient } from "@/lib/supabase/server";

/**
 * Staff booking actions (spec §5.4, §8.2). Every action:
 * - checks the signed-in person (requireStaff) and validates input with Zod;
 * - reads the booking through RLS, so barbers can only reach their own;
 * - checks the action is allowed right now (availableActions, same rules as the buttons);
 * - updates only if the booking is still in the state the button was shown for (double taps and stale screens
 *   change nothing);
 * - the database trigger enforces the status machine and barber limits again, and audits the change.
 */


const fail = (prev: BookingActionState, error: string, fields: Record<string, string> = {}): BookingActionState => ({
  ...initialBookingActionState,
  error,
  fields,
  attempt: prev.attempt + 1,
});

const success = (prev: BookingActionState, booking: DashboardBooking, message: MessagePlan | null, notice: string): BookingActionState => {
  refresh();
  return { ...initialBookingActionState, done: { booking, message, notice }, attempt: prev.attempt + 1 };
};

const stale = (prev: BookingActionState): BookingActionState => {
  refresh();
  return fail(prev, STALE_ERROR);
};

async function load(supabase: Supabase, id: string) {
  const { data, error } = await supabase.from("bookings").select(BOOKING_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toBooking(data) : null;
}

/** The booking, if this person may take `action` on it right now. */
async function loadFor(supabase: Supabase, staff: Staff, id: string, action: BookingAction) {
  const booking = await load(supabase, id);
  if (!booking) return { booking: null, allowed: false } as const;
  const b = withDates(booking);
  const allowed = availableActions({ ...b, hasPhone: Boolean(b.clientPhone) }, { staffId: staff.id, role: staff.role }, new Date()).includes(action);
  return { booking, allowed } as const;
}

const STATUS_NOTICES: Record<StatusAction, string> = {
  accept: "Booking accepted.",
  decline: "Request declined.",
  done: "Marked as done.",
  no_show: "Marked as a no-show.",
  cancel: "Booking cancelled.",
  undo: "Back to confirmed.",
};

export async function changeStatus(prev: BookingActionState, formData: FormData): Promise<BookingActionState> {
  const staff = await requireStaff();
  const parsed = statusActionSchema.safeParse({
    id: formData.get("id"),
    action: formData.get("action"),
    reason: formData.get("reason") ?? undefined,
  });
  if (!parsed.success) return fail(prev, parsed.error.issues[0]?.message ?? GENERIC_ERROR, fieldErrors(parsed.error));
  const { id, action, reason } = parsed.data;

  const supabase = await createSessionClient();
  const { booking, allowed } = await loadFor(supabase, staff, id, action);
  if (!booking) return fail(prev, NOT_ALLOWED_ERROR);
  if (!allowed) return stale(prev);

  const now = new Date().toISOString();
  const base = supabase.from("bookings");
  const query = (() => {
    switch (action) {
      case "accept":
        return base.update({ status: "confirmed" }).eq("id", id).eq("status", "pending").gt("starts_at", now);
      case "decline":
        return base.update({ status: "declined", decline_reason: reason }).eq("id", id).eq("status", "pending");
      case "done":
        return base.update({ status: "completed" }).eq("id", id).eq("status", "confirmed").lte("starts_at", now);
      case "no_show":
        return base.update({ status: "no_show" }).eq("id", id).eq("status", "confirmed").lte("starts_at", now);
      case "cancel":
        return base.update({ status: "cancelled" }).eq("id", id).eq("status", "confirmed");
      case "undo":
        return base.update({ status: "confirmed" }).eq("id", id).eq("status", booking.status);
    }
  })();
  const { data, error } = await query.select(BOOKING_COLUMNS).maybeSingle();
  if (error) return fail(prev, staffErrorMessage(error, GENERIC_ERROR));
  if (!data) return stale(prev);

  const updated = toBooking(data);
  return success(prev, updated, updated.clientPhone ? planForStatus(action, reason) : null, STATUS_NOTICES[action]);
}

export async function rescheduleBooking(prev: BookingActionState, formData: FormData): Promise<BookingActionState> {
  const staff = await requireStaff();
  const parsed = rescheduleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(prev, parsed.error.issues[0]?.message ?? GENERIC_ERROR, fieldErrors(parsed.error));
  const { id, date, minute, anyway } = parsed.data;

  const supabase = await createSessionClient();
  const { booking, allowed } = await loadFor(supabase, staff, id, "reschedule");
  if (!booking) return fail(prev, NOT_ALLOWED_ERROR);
  if (!allowed) return stale(prev);

  const start = fromLondon(date, minute);
  if (start.getTime() === new Date(booking.startsAt).getTime()) return fail(prev, "That's the same time as now.", { minute: "Pick a different time." });
  const problem = checkStaffTime("reschedule", start, new Date());
  if (problem) return fail(prev, STAFF_TIME_MESSAGES[problem], { minute: STAFF_TIME_MESSAGES[problem] });

  if (!anyway) {
    const warnings = await warningsFor(supabase, { staffId: booking.staffId, start, durationMin: booking.durationMin, serviceId: booking.serviceId });
    if (warnings.length) return { ...initialBookingActionState, warnings, attempt: prev.attempt + 1 };
  }

  const { data, error } = await supabase
    .from("bookings")
    .update({ starts_at: start.toISOString() })
    .eq("id", id)
    .eq("starts_at", booking.startsAt)
    .in("status", ["pending", "confirmed"])
    .select(BOOKING_COLUMNS)
    .maybeSingle();
  if (error) return fail(prev, staffErrorMessage(error, GENERIC_ERROR));
  if (!data) return stale(prev);

  const updated = toBooking(data);
  const message: MessagePlan | null =
    updated.status === "confirmed" && updated.clientPhone ? { kind: "updated", previousStartsAt: booking.startsAt } : null;
  return success(prev, updated, message, `Moved to ${formatDateTime(start)}.`);
}

export async function changeBarber(prev: BookingActionState, formData: FormData): Promise<BookingActionState> {
  const staff = await requireStaff();
  if (!isManager(staff)) return fail(prev, NOT_ALLOWED_ERROR);
  const parsed = changeBarberSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(prev, parsed.error.issues[0]?.message ?? GENERIC_ERROR);
  const { id, staffId, anyway } = parsed.data;

  const supabase = await createSessionClient();
  const { booking, allowed } = await loadFor(supabase, staff, id, "change_barber");
  if (!booking) return fail(prev, NOT_ALLOWED_ERROR);
  if (!allowed) return stale(prev);
  if (staffId === booking.staffId) return fail(prev, "That's already their barber.");

  const { data: target } = await supabase
    .from("staff")
    .select("display_name, bookable, active, deleted_at, role")
    .eq("id", staffId)
    .maybeSingle();
  if (!target || !target.bookable || !target.active || target.deleted_at || target.role === "admin") {
    return fail(prev, "That barber isn't taking bookings.");
  }

  if (!anyway) {
    const start = new Date(booking.startsAt);
    const warnings = await warningsFor(supabase, { staffId, start, durationMin: booking.durationMin, serviceId: booking.serviceId });
    const { data: offers } = await supabase.from("staff_services").select("service_id").eq("staff_id", staffId).eq("service_id", booking.serviceId);
    if (!offers?.length) {
      warnings.push({ code: "outside_barber_hours", message: `${target.display_name} doesn't usually do ${booking.serviceName}.` });
    }
    if (warnings.length) return { ...initialBookingActionState, warnings, attempt: prev.attempt + 1 };
  }

  const { data, error } = await supabase
    .from("bookings")
    .update({ staff_id: staffId })
    .eq("id", id)
    .eq("staff_id", booking.staffId)
    .in("status", ["pending", "confirmed"])
    .select(BOOKING_COLUMNS)
    .maybeSingle();
  if (error) return fail(prev, staffErrorMessage(error, GENERIC_ERROR));
  if (!data) return stale(prev);

  const updated = toBooking(data);
  const message: MessagePlan | null =
    updated.status === "confirmed" && updated.clientPhone ? { kind: "updated", previousBarberName: booking.staffName } : null;
  return success(prev, updated, message, `Now with ${updated.staffName}.`);
}

export async function changeService(prev: BookingActionState, formData: FormData): Promise<BookingActionState> {
  const staff = await requireStaff();
  if (!isManager(staff)) return fail(prev, NOT_ALLOWED_ERROR);
  const parsed = changeServiceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(prev, parsed.error.issues[0]?.message ?? GENERIC_ERROR, fieldErrors(parsed.error));
  const { id, serviceId, price } = parsed.data;
  const pricePence = parsePounds(price);
  if (pricePence === null) return fail(prev, "Please enter a price in pounds, e.g. 17 or 17.50.", { price: "Please enter a price in pounds, e.g. 17 or 17.50." });

  const supabase = await createSessionClient();
  const { booking, allowed } = await loadFor(supabase, staff, id, "change_service");
  if (!booking) return fail(prev, NOT_ALLOWED_ERROR);
  if (!allowed) return stale(prev);

  const { data: service } = await supabase.from("services").select("id, name, duration_min").eq("id", serviceId).maybeSingle();
  if (!service) return fail(prev, "That service no longer exists.");
  if (service.id === booking.serviceId && pricePence === booking.pricePence) return fail(prev, "Nothing has changed.");

  const { data, error } = await supabase
    .from("bookings")
    .update({ service_id: service.id, service_name: service.name, duration_min: service.duration_min, price_pence: pricePence })
    .eq("id", id)
    .eq("service_id", booking.serviceId)
    .eq("price_pence", booking.pricePence)
    .in("status", ["pending", "confirmed", "completed"])
    .select(BOOKING_COLUMNS)
    .maybeSingle();
  if (error) return fail(prev, staffErrorMessage(error, GENERIC_ERROR));
  if (!data) return stale(prev);

  const updated = toBooking(data);
  const message: MessagePlan | null =
    updated.status === "confirmed" && updated.clientPhone
      ? { kind: "updated", previousServiceName: `${booking.serviceName}, ${formatPence(booking.pricePence)}` }
      : null;
  return success(prev, updated, message, `Now ${updated.serviceName}, ${formatPence(updated.pricePence)}.`);
}

/** Walk-in or phone booking (create_walk_in / create_staff_booking re-check everything). */
export async function createBooking(prev: BookingActionState, formData: FormData): Promise<BookingActionState> {
  const staff = await requireStaff();
  const parsed = newBookingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fields = fieldErrors(parsed.error);
    return fail(prev, Object.keys(fields).length ? "Please check the details." : (parsed.error.issues[0]?.message ?? GENERIC_ERROR), fields);
  }
  const v = parsed.data;
  // Barbers only ever book themselves (the database refuses anything else too).
  const staffId = isManager(staff) ? v.staffId : staff.id;
  const start = fromLondon(v.date, v.minute);
  const problem = checkStaffTime(v.kind === "walk_in" ? "walk_in" : "phone", start, new Date());
  if (problem) return fail(prev, STAFF_TIME_MESSAGES[problem], { minute: STAFF_TIME_MESSAGES[problem] });

  const supabase = await createSessionClient();
  if (!v.anyway) {
    const { data: service } = await supabase.from("services").select("duration_min").eq("id", v.serviceId).maybeSingle();
    if (!service) return fail(prev, "That service is switched off.");
    const warnings = await warningsFor(supabase, { staffId, start, durationMin: service.duration_min, serviceId: v.serviceId });
    if (warnings.length) return { ...initialBookingActionState, warnings, attempt: prev.attempt + 1 };
  }

  const args = { p_staff: staffId, p_service: v.serviceId, p_start: start.toISOString(), p_name: v.name ?? "", p_phone: v.phone ?? "" };
  const { data: id, error } =
    v.kind === "walk_in" ? await supabase.rpc("create_walk_in", args) : await supabase.rpc("create_staff_booking", args);
  if (error || !id) {
    const message = staffErrorMessage(error, GENERIC_ERROR);
    const field = /mobile|number/i.test(message) ? "phone" : /name/i.test(message) ? "name" : null;
    return fail(prev, message, field ? { [field]: message } : {});
  }

  const created = await load(supabase, id);
  if (!created) return fail(prev, GENERIC_ERROR);
  const message: MessagePlan | null = v.kind === "phone" && created.clientPhone ? { kind: "accepted" } : null;
  return success(prev, created, message, v.kind === "walk_in" ? "Walk-in added." : `Booked for ${formatDateTime(start)}.`);
}

/** Tapping WhatsApp/SMS records that the customer was messaged (the text itself is never stored). */
export async function markMessageSent(id: string): Promise<void> {
  await requireStaff();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const supabase = await createSessionClient();
  // RLS: only bookings this person can see.
  await supabase.from("bookings").update({ message_sent_at: new Date().toISOString() }).eq("id", id);
  refresh();
}
