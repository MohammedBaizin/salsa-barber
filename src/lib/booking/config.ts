import { getSiteContent } from "@/lib/site-content";

/**
 * Online booking switch, controlled in Dashboard → Settings → Online booking (settings.online_booking).
 * Read through the cached site content; saving Settings refreshes it straight away.
 * When off, /book shows "call us / WhatsApp" and the booking API and action refuse.
 */
export async function bookingEnabled(): Promise<boolean> {
  return (await getSiteContent()).onlineBooking;
}
