/**
 * Input validation (Zod) for public booking forms and the friendly messages for every error code
 * returned by the booking RPCs (spec §5.2).
 */
import { z } from "zod";
import { normaliseUkMobile, PHONE_ERROR } from "./phone";

export const BOOKING_ERROR_CODES = [
  "service_unavailable",
  "not_changeable",
  "invalid_name",
  "invalid_phone",
  "invalid_time",
  "already_booked",
  "too_soon",
  "too_far",
  "shop_closed",
  "service_day",
  "outside_hours",
  "too_many_requests",
  "rate_limited",
  "barber_unavailable",
  "slot_taken",
] as const;

export type BookingErrorCode = (typeof BOOKING_ERROR_CODES)[number];

const MESSAGES: Record<BookingErrorCode, string> = {
  service_unavailable: "Sorry, that service isn't available to book online right now.",
  not_changeable: "This booking can't be changed online any more. Please message or call the shop.",
  invalid_name: "Please enter your name.",
  invalid_phone: PHONE_ERROR,
  invalid_time: "Please choose one of the times shown.",
  already_booked: "You already have a booking at that time.",
  too_soon: "That time is too soon to book online. Please pick a later time or call the shop.",
  too_far: "That date is too far ahead to book online. Please pick an earlier date.",
  shop_closed: "The shop is closed that day. Please pick another day.",
  service_day: "That service can't be booked online on that day. Please pick another day.",
  outside_hours: "That time is outside opening hours. Please pick another time.",
  too_many_requests: "You already have several requests waiting for a reply. Please wait for the shop to answer them.",
  rate_limited: "Too many requests from this device. Please try again in a little while or call the shop.",
  barber_unavailable: "That barber isn't available then. Please pick another time or barber.",
  slot_taken: "Sorry, someone has just taken that time. Please pick another one.",
};

export const GENERIC_ERROR = "Something went wrong. Please try again, or call the shop.";
export const OFFLINE_ERROR = "You seem to be offline. Check your connection and try again.";
export const OVERLAP_ERROR = "That time overlaps another booking for this barber.";

export function isBookingErrorCode(value: unknown): value is BookingErrorCode {
  return typeof value === "string" && (BOOKING_ERROR_CODES as readonly string[]).includes(value);
}

/** Friendly text for an RPC error code (or a database error carrying one in its message). */
export function bookingErrorMessage(code: unknown): string {
  if (isBookingErrorCode(code)) return MESSAGES[code];
  if (typeof code === "string") {
    const found = BOOKING_ERROR_CODES.find((c) => new RegExp(`\\b${c}\\b`).test(code));
    if (found) return MESSAGES[found];
  }
  return GENERIC_ERROR;
}

/** Postgres exclusion-constraint violation (double booking) from staff actions. */
export function isOverlapError(error: { code?: string } | null | undefined): boolean {
  return error?.code === "23P01";
}

/** Collapses whitespace; 1–80 characters. */
export function cleanName(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

export const nameSchema = z
  .string()
  .transform(cleanName)
  .pipe(z.string().min(1, MESSAGES.invalid_name).max(80, "Please use 80 characters or fewer."));

export const ukMobileSchema = z.string().transform((value, ctx) => {
  const e164 = normaliseUkMobile(value);
  if (!e164) {
    ctx.addIssue({ code: "custom", message: PHONE_ERROR });
    return z.NEVER;
  }
  return e164;
});

/** Customer booking request from /book. `website` is a honeypot: humans leave it empty. */
export const bookingRequestSchema = z.object({
  serviceId: z.uuid(),
  barberId: z.uuid().nullable(),
  start: z.iso.datetime({ offset: true }),
  name: nameSchema,
  phone: ukMobileSchema,
  website: z.string().max(0).optional().default(""),
  /** Manage token of the booking being changed. */
  replaces: z.uuid().nullable().optional(),
});

export type BookingRequest = z.output<typeof bookingRequestSchema>;

/** First error message per field, for forms. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}
