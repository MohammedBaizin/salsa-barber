import "server-only";
import { ownerAlertEmail, type OwnerAlertKind } from "@/lib/domain/owner-alert";
import { site, siteUrl } from "@/lib/site";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Owner alert emails through Resend's HTTP API (spec §10). Off unless RESEND_API_KEY and OWNER_ALERT_EMAIL are
 * both set. Always called from after(), so the customer never waits, and it never throws: a failed email must
 * never affect a booking.
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

/**
 * Looks the booking up by its manage token (secret key) and emails the owner. For a change, the previous time
 * comes from the booking it replaced.
 */
export async function alertOwner(kind: OwnerAlertKind, token: string): Promise<void> {
  if (!ownerAlertsEnabled()) return;
  try {
    const db = createAdminClient();
    const { data } = await db
      .from("bookings")
      .select("starts_at, service_name, booked_name, any_barber, changed_from, staff:staff_id(display_name), client:client_id(name)")
      .eq("manage_token", token)
      .maybeSingle();
    if (!data) return;
    let previousStartsAt: Date | null = null;
    if (kind === "change" && data.changed_from) {
      const { data: old } = await db.from("bookings").select("starts_at").eq("id", data.changed_from).maybeSingle();
      previousStartsAt = old ? new Date(old.starts_at) : null;
    }
    const email = ownerAlertEmail(
      {
        kind,
        name: data.booked_name ?? data.client?.name ?? "Customer",
        serviceName: data.service_name,
        barberName: data.staff?.display_name ?? "a barber",
        anyBarber: data.any_barber,
        startsAt: new Date(data.starts_at),
        previousStartsAt,
      },
      { name: site.name, siteUrl: siteUrl() },
    );
    await sendOwnerEmail(email);
  } catch (e) {
    console.error(`Owner alert email failed: ${e instanceof Error ? e.name : "error"}`);
  }
}
