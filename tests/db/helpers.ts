import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import pg from "pg";
import { afterAll, inject } from "vitest";
import type { Database } from "@/lib/supabase/database.types";

export type Client = SupabaseClient<Database>;

export const API_URL = inject("DB_TEST_API_URL");
const DB_URL = inject("DB_TEST_DB_URL");
const PUBLISHABLE = inject("DB_TEST_PUBLISHABLE_KEY");
const SECRET = inject("DB_TEST_SECRET_KEY");

/** Local sample logins from supabase/seed.sql. */
export const SAMPLE_PASSWORD = "LocalDev-Sample-1";
export const STAFF = {
  admin: "10000000-0000-4000-8000-000000000001",
  owner: "10000000-0000-4000-8000-000000000002",
  sam: "10000000-0000-4000-8000-000000000003",
  jamie: "10000000-0000-4000-8000-000000000004",
  off: "10000000-0000-4000-8000-000000000005",
} as const;
export const CLIENTS = {
  alex: "20000000-0000-4000-8000-000000000001",
  ben: "20000000-0000-4000-8000-000000000002",
  chris: "20000000-0000-4000-8000-000000000003",
  dan: "20000000-0000-4000-8000-000000000004",
} as const;

const noSession = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

/** For loops over mixed table and view names (the typed client needs a literal name). */
export function loose(client: Client): SupabaseClient {
  return client as unknown as SupabaseClient;
}

export function anon(): Client {
  return createClient<Database>(API_URL, PUBLISHABLE, { auth: noSession });
}

export function service(): Client {
  return createClient<Database>(API_URL, SECRET, { auth: noSession });
}

const sessions = new Map<string, Client>();

/** A client signed in as a seeded staff member (cached per username). */
export async function as(username: keyof typeof STAFF): Promise<Client> {
  const cached = sessions.get(username);
  if (cached) return cached;
  const client = createClient<Database>(API_URL, PUBLISHABLE, { auth: noSession });
  const { error } = await client.auth.signInWithPassword({
    email: `${username}@staff.salsabarber.invalid`,
    password: SAMPLE_PASSWORD,
  });
  if (error) throw new Error(`Sign-in as ${username} failed: ${error.message}`);
  sessions.set(username, client);
  return client;
}

/** Direct database access as postgres (trusted: no auth.uid(), RLS bypassed). For setup and checks only. */
export const db = new pg.Pool({ connectionString: DB_URL, max: 10 });

export async function sql<T extends pg.QueryResultRow = Record<string, unknown>>(text: string, values?: unknown[]) {
  return (await db.query<T>(text, values)).rows;
}

afterAll(async () => {
  await db.end();
});

/** A service id by name. */
export async function serviceId(name: string): Promise<string> {
  const rows = await sql<{ id: string }>("select id from public.services where name = $1", [name]);
  if (!rows[0]) throw new Error(`No service ${name}`);
  return rows[0].id;
}

/**
 * Inserts a booking directly (trusted) far in the future so it never collides with seed data.
 * Returns the row. `at` is London wall-clock "YYYY-MM-DD HH:MM".
 */
export async function insertBooking(opts: {
  staff: string;
  at: string;
  service?: string;
  status?: string;
  client?: string | null;
  source?: string;
}) {
  const svc = await sql<{ id: string; name: string; price_pence: number; duration_min: number }>(
    "select id, name, price_pence, duration_min from public.services where name = $1",
    [opts.service ?? "Hair Cut"],
  );
  const s = svc[0];
  const rows = await sql<{ id: string; starts_at: Date; ends_at: Date; status: string; manage_token: string }>(
    `insert into public.bookings (client_id, staff_id, service_id, service_name, price_pence, duration_min, starts_at, ends_at, status, source)
     values ($1, $2, $3, $4, $5, $6, ($7::timestamp at time zone 'Europe/London'), ($7::timestamp at time zone 'Europe/London'), $8, $9)
     returning id, starts_at, ends_at, status, manage_token`,
    [
      opts.client === undefined ? CLIENTS.dan : opts.client,
      opts.staff,
      s.id,
      s.name,
      s.price_pence,
      s.duration_min,
      opts.at,
      opts.status ?? "confirmed",
      opts.source ?? "staff",
    ],
  );
  return rows[0];
}

/** Removes test bookings (anything from 2030 onwards) and their audit rows. */
export async function cleanupBookings() {
  await sql("delete from public.audit_log where entity = 'booking' and entity_id in (select id::text from public.bookings where starts_at >= '2030-01-01')");
  await sql("delete from public.bookings where starts_at >= '2030-01-01'");
}
