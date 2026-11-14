import "server-only";
import { ownerAlertEmail, type OwnerAlertKind } from "@/lib/domain/owner-alert";
import { pushMessage, pushRecipients, type AlertPerson } from "@/lib/domain/push";
import { ownerAlertsEnabled, sendOwnerEmail } from "@/lib/email/owner-alert";
import { pushEnabled, pushToSubscriptions, subscriptionsFor } from "@/lib/push/server";
import { site, siteUrl } from "@/lib/site";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Alerts for a customer's online request, change or cancel (spec §10): the owner email and push alerts on staff
 * phones. Called from after(), so the customer never waits. Looks the booking up by its manage token with the
 * secret key; never includes the phone number; never throws.
 */
export async function bookingAlert(kind: OwnerAlertKind, token: string): Promise<void> {
  if (!ownerAlertsEnabled() && !pushEnabled()) return;
  try {
    const db = createAdminClient();
    const { data } = await db
      .from("bookings")
      .select("staff_id, starts_at, service_name, booked_name, any_barber, changed_from, staff:staff_id(display_name), client:client_id(name)")
      .eq("manage_token", token)
      .maybeSingle();
    if (!data) return;
    let previousStartsAt: Date | null = null;
    if (kind === "change" && data.changed_from) {
      const { data: old } = await db.from("bookings").select("starts_at").eq("id", data.changed_from).maybeSingle();
      previousStartsAt = old ? new Date(old.starts_at) : null;
    }
    const booking = {
      name: data.booked_name ?? data.client?.name ?? "Customer",
      serviceName: data.service_name,
      barberName: data.staff?.display_name ?? "a barber",
      anyBarber: data.any_barber,
      startsAt: new Date(data.starts_at),
      previousStartsAt,
    };

    const jobs: Promise<unknown>[] = [];
    if (ownerAlertsEnabled()) jobs.push(sendOwnerEmail(ownerAlertEmail({ kind, ...booking }, { name: site.name, siteUrl: siteUrl() })));
    if (pushEnabled()) {
      jobs.push(
        (async () => {
          const { data: staff } = await db.from("staff").select("id, user_id, role, active, deleted_at").not("user_id", "is", null);
          const people: (AlertPerson & { userId: string })[] = (staff ?? []).map((s) => ({
            id: s.id,
            userId: s.user_id!,
            role: s.role as AlertPerson["role"],
            active: s.active,
            deleted: s.deleted_at !== null,
          }));
          const ids = new Set(pushRecipients(people, data.staff_id));
          const subscriptions = await subscriptionsFor(people.filter((p) => ids.has(p.id)).map((p) => p.userId));
          await pushToSubscriptions(subscriptions, pushMessage(kind, booking));
        })(),
      );
    }
    await Promise.all(jobs);
  } catch (e) {
    console.error(`Booking alert failed: ${e instanceof Error ? e.name : "error"}`);
  }
}
