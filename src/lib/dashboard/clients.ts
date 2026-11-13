import "server-only";
import type { Staff } from "@/lib/auth/staff";
import { clientSearchArgs, CLIENTS_PER_PAGE, type ClientFilter, type ClientListParams } from "@/lib/domain/clients";
import { isManager } from "@/lib/domain/team";
import { createSessionClient } from "@/lib/supabase/server";
import { BOOKING_COLUMNS, toBooking } from "./bookings";
import { loadBookingSetup } from "./setup";
import type { BarberOption, BookingSetup, DashboardBooking } from "./types";

/**
 * RLS-scoped client queries. Barbers only ever receive clients with at least one booking with them, and their
 * numbers only count their own visits and spend (client_stats is security_invoker).
 */

export type ClientStatsRow = {
  visits: number;
  spentPence: number;
  noShows: number;
  lastVisit: string | null;
  nextVisit: string | null;
};

export type ClientListRow = { id: string; name: string; phone: string; createdAt: string } & ClientStatsRow;

export type ClientListData = {
  now: string;
  dueBackWeeks: number;
  rows: ClientListRow[];
  counts: Record<ClientFilter, number>;
  barbers: BarberOption[];
};

async function dueBackWeeks(supabase: Awaited<ReturnType<typeof createSessionClient>>): Promise<number> {
  const { data, error } = await supabase.from("settings").select("due_back_weeks").eq("id", 1).single();
  if (error) throw new Error(`Couldn't load settings: ${error.message}`);
  return data.due_back_weeks;
}

export async function loadClientList(staff: Staff, p: ClientListParams): Promise<ClientListData> {
  const supabase = await createSessionClient();
  const manager = isManager(staff);
  const [list, weeks, barbers] = await Promise.all([
    supabase.rpc("client_list", {
      p_filter: p.filter,
      ...clientSearchArgs(p.q),
      p_staff: manager ? p.barber : null,
      p_limit: CLIENTS_PER_PAGE,
      p_offset: (p.page - 1) * CLIENTS_PER_PAGE,
    } as never),
    dueBackWeeks(supabase),
    manager
      ? supabase.from("staff").select("id, display_name").eq("bookable", true).is("deleted_at", null).neq("role", "admin").order("sort")
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (list.error) throw new Error(`Couldn't load clients: ${list.error.message}`);

  type Row = {
    id: string | null; name: string; phone: string; created_at: string; visits: number; spent_pence: number; no_shows: number;
    last_visit: string | null; next_visit: string | null; n_all: number; n_due_back: number; n_regular: number; n_new: number;
  };
  const data = (list.data ?? []) as Row[];
  const first = data[0];
  return {
    now: new Date().toISOString(),
    dueBackWeeks: weeks,
    rows: data
      .filter((r) => r.id)
      .map((r) => ({
        id: r.id!,
        name: r.name,
        phone: r.phone,
        createdAt: r.created_at,
        visits: r.visits,
        spentPence: r.spent_pence,
        noShows: r.no_shows,
        lastVisit: r.last_visit,
        nextVisit: r.next_visit,
      })),
    counts: {
      all: Number(first?.n_all ?? 0),
      due_back: Number(first?.n_due_back ?? 0),
      regular: Number(first?.n_regular ?? 0),
      new: Number(first?.n_new ?? 0),
    },
    barbers: (barbers.data ?? []).map((b) => ({ id: b.id, name: b.display_name })),
  };
}

export type ClientPageData = {
  now: string;
  today: string;
  dueBackWeeks: number;
  client: { id: string; name: string; phone: string; createdAt: string };
  stats: ClientStatsRow & {
    usualServiceId: string | null;
    usualServiceName: string | null;
    usualStaffId: string | null;
    usualStaffName: string | null;
    usualStartMinute: number | null;
  };
  bookings: DashboardBooking[];
  setup: BookingSetup;
};

/** One client (null when this person can't see them: barbers only see their own clients). */
export async function loadClient(staff: Staff, id: string, today: string): Promise<ClientPageData | null> {
  const supabase = await createSessionClient();
  const { data: client, error } = await supabase.from("clients").select("id, name, phone, created_at").eq("id", id).maybeSingle();
  if (error) throw new Error(`Couldn't load the client: ${error.message}`);
  if (!client) return null;

  const [stats, bookings, weeks, setup] = await Promise.all([
    supabase.from("client_stats").select("*").eq("client_id", id).single(),
    supabase.from("bookings").select(BOOKING_COLUMNS).eq("client_id", id).order("starts_at", { ascending: false }),
    dueBackWeeks(supabase),
    loadBookingSetup(supabase, staff),
  ]);
  if (stats.error || bookings.error) throw new Error("Couldn't load the client's bookings.");
  const s = stats.data;

  let usualStaffName: string | null = null;
  if (s.usual_staff_id) {
    const { data } = await supabase.from("staff").select("display_name").eq("id", s.usual_staff_id).maybeSingle();
    usualStaffName = data?.display_name ?? null;
  }

  return {
    now: new Date().toISOString(),
    today,
    dueBackWeeks: weeks,
    client: { id: client.id, name: client.name, phone: client.phone, createdAt: client.created_at },
    stats: {
      visits: s.visits ?? 0,
      spentPence: s.spent_pence ?? 0,
      noShows: s.no_shows ?? 0,
      lastVisit: s.last_visit,
      nextVisit: s.next_visit,
      usualServiceId: s.usual_service_id,
      usualServiceName: s.usual_service_name,
      usualStaffId: s.usual_staff_id,
      usualStaffName,
      usualStartMinute: s.usual_start_minute,
    },
    bookings: (bookings.data ?? []).map(toBooking),
    setup,
  };
}
