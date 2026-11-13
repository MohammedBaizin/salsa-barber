import "server-only";
import type { Staff } from "@/lib/auth/staff";
import { bookingEnabled } from "@/lib/booking/config";
import type { WeeklyHours } from "@/lib/domain/hours";
import { weeklyHoursSchema } from "@/lib/domain/hours-schema";
import { scheduleWarnings, type ScheduleWarning } from "@/lib/domain/schedule";
import { dateKey } from "@/lib/domain/time";
import { site, siteUrl } from "@/lib/site";
import type { Supabase } from "./bookings";
import type { BookingSetup } from "./types";

/** Shop details used in customer messages. */
export function messageShop(): BookingSetup["shop"] {
  return {
    name: site.name,
    address: `${site.address.street}, ${site.address.area} ${site.address.postcode}`,
    phoneDisplay: site.phone.display,
    siteUrl: siteUrl(),
    bookingEnabled: bookingEnabled(),
  };
}

/** Services and barbers for the booking sheets (RLS-scoped session client). */
export async function loadBookingSetup(supabase: Supabase, staff: Staff): Promise<BookingSetup> {
  const [services, barbers, links] = await Promise.all([
    supabase.from("services").select("id, name, price_pence, duration_min, bookable_days").eq("active", true).order("sort").order("name"),
    supabase
      .from("staff")
      .select("id, display_name")
      .eq("bookable", true)
      .eq("active", true)
      .is("deleted_at", null)
      .neq("role", "admin")
      .order("sort")
      .order("display_name"),
    supabase.from("staff_services").select("staff_id, service_id"),
  ]);
  for (const r of [services, barbers, links]) if (r.error) throw new Error(`Couldn't load booking options: ${r.error.message}`);

  return {
    actor: { staffId: staff.id, role: staff.role, bookable: staff.bookable },
    services: (services.data ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      pricePence: s.price_pence,
      durationMin: s.duration_min,
      days: s.bookable_days,
    })),
    barbers: (barbers.data ?? []).map((b) => ({
      id: b.id,
      name: b.display_name,
      serviceIds: (links.data ?? []).filter((l) => l.staff_id === b.id).map((l) => l.service_id),
    })),
    shop: messageShop(),
  };
}

/**
 * Warnings for a staff-chosen time (closed day, outside hours, time off, service day): shown, never blocking.
 */
export async function warningsFor(
  supabase: Supabase,
  opts: { staffId: string; start: Date; durationMin: number; serviceId: string },
): Promise<ScheduleWarning[]> {
  const day = dateKey(opts.start);
  const [settings, closures, barber, timeOff, service] = await Promise.all([
    supabase.from("settings").select("shop_hours").eq("id", 1).single(),
    supabase.from("closures").select("closed_on").eq("closed_on", day),
    supabase.from("staff").select("display_name, weekly_hours").eq("id", opts.staffId).single(),
    supabase.from("time_off").select("starts_on, ends_on").eq("staff_id", opts.staffId).lte("starts_on", day).gte("ends_on", day),
    supabase.from("services").select("name, bookable_days").eq("id", opts.serviceId).maybeSingle(),
  ]);
  if (settings.error || barber.error) throw new Error("Couldn't check the schedule.");
  const hours = (value: unknown): WeeklyHours => weeklyHoursSchema.safeParse(value).data ?? {};

  return scheduleWarnings({
    start: opts.start,
    durationMin: opts.durationMin,
    shopHours: hours(settings.data.shop_hours),
    closures: (closures.data ?? []).map((c) => c.closed_on),
    barberName: barber.data.display_name,
    barberHours: hours(barber.data.weekly_hours),
    timeOff: (timeOff.data ?? []).map((t) => ({ startsOn: t.starts_on, endsOn: t.ends_on })),
    service: service.data ? { name: service.data.name, days: service.data.bookable_days } : undefined,
  });
}
