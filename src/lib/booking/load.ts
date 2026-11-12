/**
 * Loads everything availableSlots() needs for one service (and optionally one barber).
 * Takes a Supabase client so the API route (secret key) and the DB parity test share exactly this code.
 * Bookings are read as start/end times and barber only: never names or phones.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AvailabilityBarber, AvailabilityInput } from "@/lib/domain/availability";
import type { WeeklyHours } from "@/lib/domain/hours";
import { addDays, dateKey } from "@/lib/domain/time";
import type { Database } from "@/lib/supabase/database.types";

export type LoadedAvailability = {
  service: { id: string; name: string; durationMin: number; bookableDays: number[] | null };
  input: AvailabilityInput;
};

export async function loadAvailability(
  db: SupabaseClient<Database>,
  opts: { serviceId: string; barberId?: string | null; now: Date; ignoreToken?: string | null },
): Promise<LoadedAvailability | null> {
  const [settingsRes, serviceRes] = await Promise.all([
    db.from("settings").select("shop_hours, min_notice_minutes, booking_window_days").eq("id", 1).single(),
    db.from("services").select("id, name, duration_min, bookable_days, active").eq("id", opts.serviceId).maybeSingle(),
  ]);
  if (settingsRes.error) throw settingsRes.error;
  const service = serviceRes.data;
  if (!service || !service.active) return null;
  const settings = settingsRes.data;

  const today = dateKey(opts.now);
  const lastDay = addDays(today, Math.max(1, settings.booking_window_days) - 1);

  let staffQuery = db
    .from("staff")
    .select("id, sort, weekly_hours, staff_services!inner(service_id)")
    .eq("active", true)
    .eq("bookable", true)
    .is("deleted_at", null)
    .neq("role", "admin")
    .eq("staff_services.service_id", service.id);
  if (opts.barberId) staffQuery = staffQuery.eq("id", opts.barberId);

  const [staffRes, closuresRes, timeOffRes, bookingsRes, ignoreRes] = await Promise.all([
    staffQuery,
    db.from("closures").select("closed_on").gte("closed_on", today).lte("closed_on", lastDay),
    db.from("time_off").select("staff_id, starts_on, ends_on").lte("starts_on", lastDay).gte("ends_on", today),
    db
      .from("bookings")
      .select("id, staff_id, starts_at, ends_at")
      .in("status", ["pending", "confirmed"])
      .gte("ends_at", opts.now.toISOString())
      .lte("starts_at", `${addDays(lastDay, 1)}T23:59:59Z`),
    opts.ignoreToken
      ? db.from("bookings").select("id").eq("manage_token", opts.ignoreToken).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  for (const r of [staffRes, closuresRes, timeOffRes, bookingsRes]) if (r.error) throw r.error;

  const barbers: AvailabilityBarber[] = staffRes.data!.map((s) => ({
    id: s.id,
    sort: s.sort,
    weeklyHours: (s.weekly_hours ?? {}) as WeeklyHours,
    timeOff: timeOffRes.data!.filter((t) => t.staff_id === s.id).map((t) => ({ startsOn: t.starts_on, endsOn: t.ends_on })),
  }));

  return {
    service: { id: service.id, name: service.name, durationMin: service.duration_min, bookableDays: service.bookable_days },
    input: {
      now: opts.now,
      durationMin: service.duration_min,
      serviceDays: service.bookable_days,
      shopHours: (settings.shop_hours ?? {}) as WeeklyHours,
      closures: closuresRes.data!.map((c) => c.closed_on),
      barbers,
      bookings: bookingsRes.data!.map((b) => ({
        id: b.id,
        staffId: b.staff_id,
        startsAt: new Date(b.starts_at),
        endsAt: new Date(b.ends_at),
      })),
      minNoticeMinutes: settings.min_notice_minutes,
      bookingWindowDays: settings.booking_window_days,
      ignoreBookingId: ignoreRes.data?.id ?? null,
    },
  };
}
