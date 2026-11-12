"use server";

import { headers } from "next/headers";
import { bookingEnabled } from "@/lib/booking/config";
import { bookingErrorMessage, bookingRequestSchema, fieldErrors, GENERIC_ERROR, isBookingErrorCode, type BookingErrorCode } from "@/lib/domain/validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { visitorHash } from "@/lib/visitor";

export type RequestState = {
  error: string | null;
  code: BookingErrorCode | null;
  fields: Record<string, string>;
  token: string | null;
  /** Bumped on every answer so the client can react to repeated errors. */
  attempt: number;
};

/**
 * Sends a booking request. Validates with Zod, then request_booking() (secret key) re-checks everything,
 * applies limits and picks the barber. Returns the private manage token; the browser then loads /booking/<token>.
 */
export async function requestBooking(prev: RequestState, formData: FormData): Promise<RequestState> {
  const attempt = prev.attempt + 1;
  if (!bookingEnabled()) return { error: "Online booking is off. Please call the shop.", code: "service_unavailable", fields: {}, token: null, attempt };

  const parsed = bookingRequestSchema.safeParse({
    serviceId: formData.get("serviceId"),
    barberId: formData.get("barberId") || null,
    start: formData.get("start"),
    name: String(formData.get("name") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    website: String(formData.get("website") ?? ""),
    replaces: formData.get("replaces") || null,
  });
  if (!parsed.success) {
    const fields = fieldErrors(parsed.error);
    // A filled honeypot or a tampered form: no detail for bots.
    const visible = Object.fromEntries(Object.entries(fields).filter(([k]) => k === "name" || k === "phone"));
    return { error: Object.keys(visible).length ? null : GENERIC_ERROR, code: null, fields: visible, token: null, attempt };
  }

  const r = parsed.data;
  const { data, error } = await createAdminClient().rpc("request_booking", {
    p_service: r.serviceId,
    p_start: r.start,
    p_name: r.name,
    p_phone: r.phone,
    p_staff: r.barberId ?? undefined,
    p_replaces: r.replaces ?? undefined,
    p_ip_hash: visitorHash(await headers()),
  });
  if (error || !data?.[0]) {
    const code = isBookingErrorCode(error?.message) ? error.message : null;
    return { error: bookingErrorMessage(error?.message), code, fields: {}, token: null, attempt };
  }
  return { error: null, code: null, fields: {}, token: data[0].manage_token, attempt };
}
