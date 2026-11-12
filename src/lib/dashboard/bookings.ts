import "server-only";
import type { Staff } from "@/lib/auth/staff";
import type { BookingSource, BookingStatus } from "@/lib/domain/today";
import { addDays, dateKey, fromLondon } from "@/lib/domain/time";
import { isManager } from "@/lib/domain/team";
import { createSessionClient } from "@/lib/supabase/server";
import type { BarberOption, DashboardBooking } from "./types";

/**
 * RLS-scoped booking queries for the dashboard. Everything goes through the signed-in person's session,
 * so barbers only ever receive their own bookings and clients (spec §7).
 */

const BOOKING_COLUMNS = `
  id, status, source, starts_at, ends_at, created_at, service_name, price_pence, duration_min, staff_id, client_id,
  booked_name, any_barber, changed_from, decline_reason, message_sent_at, cancelled_by_client,
  client:clients!bookings_client_id_fkey (name, phone),
  barber:staff!bookings_staff_id_fkey (display_name)
` as const;

type Supabase = Awaited<ReturnType<typeof createSessionClient>>;

type BookingRow = NonNullable<Awaited<ReturnType<typeof bookingsQuery>>["data"]>[number];

function toBooking(row: BookingRow): DashboardBooking {
  return {
    id: row.id,
    status: row.status as BookingStatus,
    source: row.source as BookingSource,
    startsAt: new Date(row.starts_at).toISOString(),
    endsAt: new Date(row.ends_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
    serviceName: row.service_name,
    pricePence: row.price_pence,
    durationMin: row.duration_min,
    staffId: row.staff_id,
    staffName: row.barber?.display_name ?? "Former barber",
    clientId: row.client_id,
    clientName: row.client?.name ?? null,
    clientPhone: row.client?.phone ?? null,
    bookedName: row.booked_name,
    anyBarber: row.any_barber,
    changedFrom: row.changed_from,
    declineReason: row.decline_reason,
    messageSentAt: row.message_sent_at,
    cancelledByClient: row.cancelled_by_client,
  };
}

function rows<T>(result: { data: T[] | null; error: { message: string } | null }, what: string): T[] {
  if (result.error) throw new Error(`Couldn't load ${what}: ${result.error.message}`);
  return result.data ?? [];
}

function bookingsQuery(supabase: Supabase) {
  return supabase.from("bookings").select(BOOKING_COLUMNS);
}

/** Bookable barbers for the filters (owner/admin only). */
async function barberOptions(supabase: Supabase): Promise<BarberOption[]> {
  const result = await supabase
    .from("staff")
    .select("id, display_name")
    .eq("bookable", true)
    .eq("active", true)
    .is("deleted_at", null)
    .order("sort")
    .order("display_name");
  return rows(result, "the team").map((s) => ({ id: s.id, name: s.display_name }));
}

/** Waiting requests (all days). Used by the header bell. */
export async function pendingCount(): Promise<number> {
  const supabase = await createSessionClient();
  const { count, error } = await supabase.from("bookings").select("id", { count: "exact", head: true }).eq("status", "pending");
  if (error) throw new Error(`Couldn't count requests: ${error.message}`);
  return count ?? 0;
}

export type TodayData = {
  now: string;
  today: string;
  /** Every booking starting today (London), any status. */
  todays: DashboardBooking[];
  /** Every pending request, any day. */
  requests: DashboardBooking[];
  /** Other live bookings of the requesting clients (for "Same number has another booking"). */
  requestClientsLive: Pick<DashboardBooking, "id" | "clientId" | "status" | "endsAt">[];
  /** Confirmed bookings that have ended without Done/No-show (any day). */
  needsClosing: DashboardBooking[];
  dueBack: number;
  barbers: BarberOption[];
};

const MAX_LISTED = 100;

export async function loadToday(staff: Staff): Promise<TodayData> {
  const supabase = await createSessionClient();
  const now = new Date();
  const today = dateKey(now);
  const nowIso = now.toISOString();

  const [todays, requests, closing, settings, barbers] = await Promise.all([
    bookingsQuery(supabase)
      .gte("starts_at", fromLondon(today, 0).toISOString())
      .lt("starts_at", fromLondon(addDays(today, 1), 0).toISOString())
      .order("starts_at"),
    bookingsQuery(supabase).eq("status", "pending").order("starts_at").limit(MAX_LISTED),
    bookingsQuery(supabase).eq("status", "confirmed").lte("ends_at", nowIso).order("starts_at").limit(MAX_LISTED),
    supabase.from("settings").select("due_back_weeks").eq("id", 1).single(),
    isManager(staff) ? barberOptions(supabase) : Promise.resolve([]),
  ]);
  if (settings.error) throw new Error(`Couldn't load settings: ${settings.error.message}`);

  const requestRows = rows(requests, "requests").map(toBooking);
  const clientIds = [...new Set(requestRows.map((r) => r.clientId).filter((id): id is string => Boolean(id)))];
  const dueBackCutoff = new Date(now.getTime() - settings.data.due_back_weeks * 7 * 86_400_000).toISOString();

  const [live, dueBack] = await Promise.all([
    clientIds.length
      ? supabase
          .from("bookings")
          .select("id, client_id, status, ends_at")
          .in("client_id", clientIds)
          .in("status", ["pending", "confirmed"])
          .gt("ends_at", nowIso)
      : Promise.resolve({ data: [], error: null }),
    // Due back = last completed visit longer ago than the setting, nothing upcoming (same rule as domain/clients).
    supabase
      .from("client_stats")
      .select("client_id", { count: "exact", head: true })
      .lt("last_visit", dueBackCutoff)
      .is("next_visit", null),
  ]);
  if (dueBack.error) throw new Error(`Couldn't count due-back clients: ${dueBack.error.message}`);

  return {
    now: nowIso,
    today,
    todays: rows(todays, "today's bookings").map(toBooking),
    requests: requestRows,
    requestClientsLive: rows(live, "bookings").map((b) => ({
      id: b.id,
      clientId: b.client_id,
      status: b.status as BookingStatus,
      endsAt: new Date(b.ends_at).toISOString(),
    })),
    needsClosing: rows(closing, "bookings to close").map(toBooking),
    dueBack: dueBack.count ?? 0,
    barbers,
  };
}
