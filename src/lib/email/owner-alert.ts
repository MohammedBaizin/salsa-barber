import "server-only";

/**
 * Owner alert emails through Resend's HTTP API (spec §10). Off unless RESEND_API_KEY and OWNER_ALERT_EMAIL are
 * both set. Sent by bookingAlert() (src/lib/alerts.ts) from after(), so the customer never waits; it never throws:
 * a failed email must never affect a booking.
 */

const RESEND_URL = "https://api.resend.com/emails";
/** Resend's shared test sender; set ALERT_FROM_EMAIL to an address on a verified domain for real use. */
const DEFAULT_FROM = "Booking alerts <onboarding@resend.dev>";

export function ownerAlertsEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.OWNER_ALERT_EMAIL);
}

type Send = (url: string, init: RequestInit) => Promise<Response>;

/** Sends one email. Returns "off", "sent" or "failed" (never throws). */
export async function sendOwnerEmail(email: { subject: string; text: string }, send: Send = fetch): Promise<"off" | "sent" | "failed"> {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.OWNER_ALERT_EMAIL;
  if (!key || !to) return "off";
  try {
    const res = await send(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.ALERT_FROM_EMAIL || DEFAULT_FROM, to: [to], subject: email.subject, text: email.text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(`Owner alert email failed: HTTP ${res.status}`);
      return "failed";
    }
    return "sent";
  } catch (e) {
    console.error(`Owner alert email failed: ${e instanceof Error ? e.name : "error"}`);
    return "failed";
  }
}
