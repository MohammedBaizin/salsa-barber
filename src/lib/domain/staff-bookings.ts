/**
 * Staff booking actions (spec §5.4–5.6, §8.2): input schemas, the message each action leads to, and friendly
 * text for every refusal. Pure, so the server actions and the UI share one source of truth.
 */
import { z } from "zod";
import { acceptedMessage, cancelledMessage, declinedMessage, updatedMessage, type MessageBooking, type MessageShop } from "./messages";
import { normaliseUkMobile, PHONE_ERROR } from "./phone";
import { STAFF_TIME_MESSAGES } from "./schedule";
import { isDateKey } from "./time";
import { OVERLAP_ERROR } from "./validation";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export const STALE_ERROR = "This booking has just been changed (maybe on another phone). The screen has been updated, so please check it and try again.";
export const NOT_ALLOWED_ERROR = "Your account can't do that.";

const STAFF_ERRORS: Record<string, string> = {
  not_allowed: NOT_ALLOWED_ERROR,
  barber_unavailable: "That barber isn't taking bookings.",
  service_unavailable: "That service is switched off.",
  not_on_grid: STAFF_TIME_MESSAGES.not_on_grid,
  walk_in_window: STAFF_TIME_MESSAGES.walk_in_window,
  in_the_past: STAFF_TIME_MESSAGES.in_the_past,
  too_far: STAFF_TIME_MESSAGES.too_far,
  invalid_phone: PHONE_ERROR,
  invalid_name: "Please enter the customer's name.",
  name_needs_phone: "Add their mobile number too, or leave the name empty for a walk-in without details.",
  overlap: OVERLAP_ERROR,
  invalid_status_change: STALE_ERROR,
};

/** Friendly text for a database error from a staff action. */
export function staffErrorMessage(error: { code?: string; message?: string } | null | undefined, fallback: string): string {
  if (!error) return fallback;
  if (error.code === "23P01") return OVERLAP_ERROR;
  if (error.code === "42501") return NOT_ALLOWED_ERROR;
  const code = Object.keys(STAFF_ERRORS).find((c) => error.message === c || new RegExp(`\\b${c}\\b`).test(error.message ?? ""));
  return code ? STAFF_ERRORS[code] : fallback;
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

const id = z.uuid();
const minuteOfDay = z.coerce.number().int().min(0).max(24 * 60 - 5).refine((m) => m % 5 === 0, STAFF_TIME_MESSAGES.not_on_grid);
const dateKey = z.string().refine(isDateKey, "Please choose a date.");
const anyway = z.preprocess((v) => v === "1" || v === "true" || v === true, z.boolean());

export const STATUS_ACTIONS = ["accept", "decline", "done", "no_show", "cancel", "undo"] as const;
export type StatusAction = (typeof STATUS_ACTIONS)[number];

export const DECLINE_REASON_MAX = 200;

export const statusActionSchema = z.object({
  id,
  action: z.enum(STATUS_ACTIONS),
  reason: z
    .string()
    .optional()
    .transform((v) => v?.replace(/\s+/g, " ").trim() || null)
    .refine((v) => !v || v.length <= DECLINE_REASON_MAX, `Keep the reason under ${DECLINE_REASON_MAX} characters.`),
});

export const rescheduleSchema = z.object({ id, date: dateKey, minute: minuteOfDay, anyway });
export const changeBarberSchema = z.object({ id, staffId: id, anyway });
export const changeServiceSchema = z.object({
  id,
  serviceId: id,
  price: z.string().trim().min(1, "Please enter a price."),
});

const optionalText = z.string().optional().transform((v) => v?.replace(/\s+/g, " ").trim() || null);

export const newBookingSchema = z
  .object({
    kind: z.enum(["walk_in", "phone"]),
    staffId: id,
    serviceId: z.string().min(1, "Please choose a service.").pipe(id),
    date: dateKey,
    minute: minuteOfDay,
    name: optionalText.refine((v) => !v || v.length <= 80, "Keep the name under 80 characters."),
    phone: optionalText,
    anyway,
  })
  .transform((v, ctx) => {
    let phone: string | null = null;
    if (v.phone) {
      phone = normaliseUkMobile(v.phone);
      if (!phone) ctx.addIssue({ code: "custom", path: ["phone"], message: PHONE_ERROR });
    }
    if (v.kind === "phone") {
      if (!v.name) ctx.addIssue({ code: "custom", path: ["name"], message: STAFF_ERRORS.invalid_name });
      if (!v.phone) ctx.addIssue({ code: "custom", path: ["phone"], message: PHONE_ERROR });
    } else if (v.name && !v.phone) {
      ctx.addIssue({ code: "custom", path: ["phone"], message: STAFF_ERRORS.name_needs_phone });
    }
    return { ...v, phone };
  });

// ---------------------------------------------------------------------------
// Messages after an action
// ---------------------------------------------------------------------------

export type MessagePlan =
  | { kind: "accepted" }
  | { kind: "declined"; reason: string | null }
  | { kind: "cancelled" }
  | { kind: "updated"; previousStartsAt?: string; previousBarberName?: string; previousServiceName?: string };

export const MESSAGE_TITLES: Record<MessagePlan["kind"], string> = {
  accepted: "Booking confirmed",
  declined: "Request declined",
  cancelled: "Booking cancelled",
  updated: "Booking changed",
};

/** Which customer message follows a status change (null: nothing to tell the customer). */
export function planForStatus(action: StatusAction, reason: string | null): MessagePlan | null {
  switch (action) {
    case "accept":
      return { kind: "accepted" };
    case "decline":
      return { kind: "declined", reason };
    case "cancel":
      return { kind: "cancelled" };
    default:
      return null;
  }
}

/** "Message" from the details sheet: the message that matches the booking as it is now. */
export function planForBooking(status: string, declineReason: string | null): MessagePlan | null {
  if (status === "confirmed") return { kind: "accepted" };
  if (status === "declined") return { kind: "declined", reason: declineReason };
  if (status === "cancelled") return { kind: "cancelled" };
  return null;
}

export function bookingMessage(plan: MessagePlan, b: MessageBooking, shop: MessageShop): string {
  switch (plan.kind) {
    case "accepted":
      return acceptedMessage(b, shop);
    case "declined":
      return declinedMessage(b, shop, plan.reason);
    case "cancelled":
      return cancelledMessage(b, shop);
    case "updated":
      return updatedMessage(b, shop, {
        previousStartsAt: plan.previousStartsAt ? new Date(plan.previousStartsAt) : undefined,
        previousBarberName: plan.previousBarberName,
        previousServiceName: plan.previousServiceName,
      });
  }
}
