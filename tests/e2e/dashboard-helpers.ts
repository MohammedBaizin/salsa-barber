import { expect, test, type Page } from "@playwright/test";
import { londonParts } from "../../src/lib/domain/time";
import { signIn, sql } from "./helpers";

/**
 * Dashboard test data. Test clients use 07700 9007xx (Ofcom drama range); walk-ins without a client that tests
 * add are removed by their marker barber/time window (see cleanupDashboardData).
 */
export const PHONE_LIKE = "+4477009007%";
export const CLIENT_A = "+447700900701";
export const CLIENT_B = "+447700900702";
export const CLIENT_C = "+447700900703";

const startedAt = new Date();

export async function cleanupDashboardData() {
  const ids = `select id from public.bookings where client_id in (select id from public.clients where phone like '${PHONE_LIKE}')
    or (client_id is null and created_at >= $1)`;
  await sql(`delete from public.audit_log where entity = 'booking' and entity_id in (select id::text from (${ids}) x)`, [startedAt]);
  await sql(`delete from public.bookings where id in (${ids})`, [startedAt]);
  await sql(`delete from public.clients where phone like '${PHONE_LIKE}'`);
}

export async function client(phone: string, name: string): Promise<string> {
  const [row] = await sql("insert into public.clients (name, phone) values ($1, $2) returning id", [name, phone]);
  return row.id;
}

/** A 30-minute Hair Cut starting `startMin` minutes from now (whole minutes), created `createdMin` minutes from now. */
export async function booking(opts: {
  clientId: string;
  barber?: string;
  startMin: number;
  status?: string;
  createdMin?: number;
  changedFrom?: string | null;
}): Promise<string> {
  const [row] = await sql(
    `insert into public.bookings (client_id, staff_id, service_id, service_name, price_pence, duration_min, starts_at, ends_at,
       status, source, created_at, changed_from)
     select $1, st.id, sv.id, sv.name, sv.price_pence, 30,
       date_trunc('minute', now()) + make_interval(mins => $2), date_trunc('minute', now()) + make_interval(mins => $2),
       $3, 'online', now() + make_interval(mins => $4), $5
     from public.staff st, public.services sv where st.username = $6 and sv.name = 'Hair Cut'
     returning id`,
    [opts.clientId, opts.startMin, opts.status ?? "confirmed", opts.createdMin ?? -5, opts.changedFrom ?? null, opts.barber ?? "jamie"],
  );
  return row.id;
}

/** A booking at a London wall-clock time `days` from today ("HH:MM"). */
export async function bookingAt(opts: { clientId: string; days: number; time: string; barber?: string; status?: string }): Promise<string> {
  const [row] = await sql(
    `insert into public.bookings (client_id, staff_id, service_id, service_name, price_pence, duration_min, starts_at, ends_at, status, source)
     select $1, st.id, sv.id, sv.name, sv.price_pence, 30, t, t, $2, 'online'
     from public.staff st, public.services sv,
       lateral (select (((now() at time zone 'Europe/London')::date + $3::int) + $4::time) at time zone 'Europe/London' as t) x
     where st.username = $5 and sv.name = 'Hair Cut'
     returning id`,
    [opts.clientId, opts.status ?? "confirmed", opts.days, opts.time, opts.barber ?? "jamie"],
  );
  return row.id;
}

export async function bookingRow(id: string) {
  const [row] = await sql(
    `select b.status, b.decline_reason, b.message_sent_at, b.price_pence, b.service_name, b.starts_at, s.username as barber
     from public.bookings b join public.staff s on s.id = b.staff_id where b.id = $1`,
    [id],
  );
  return row;
}

/** Bookings "today" need room before midnight (London) on both sides. */
export function skipNearMidnight() {
  const { hour } = londonParts(new Date());
  test.skip(hour < 2 || hour >= 21, "Needs a few hours of today left (London time).");
}

export async function signInAs(page: Page, username: string) {
  await page.goto("/login");
  await signIn(page, username);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId("greeting")).toBeVisible();
}

/** London date key `days` from today. */
export async function londonDay(days: number): Promise<string> {
  const [row] = await sql("select to_char((now() at time zone 'Europe/London')::date + $1::int, 'YYYY-MM-DD') as d", [days]);
  return row.d;
}
