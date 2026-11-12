/**
 * Online booking switch (spec §4.3). Off until the owner confirms hours, service lengths and barbers.
 * When off, /book shows "call us / WhatsApp" and the booking API and action refuse.
 */
export function bookingEnabled(): boolean {
  return process.env.NEXT_PUBLIC_BOOKING_ENABLED === "true";
}
