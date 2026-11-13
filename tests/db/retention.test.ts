import { afterAll, describe, expect, it } from "vitest";
import { anon, as, insertBooking, service, sql, STAFF } from "./helpers";

/**
 * Nightly retention (spec §6.5). Test rows use 07700 90098x numbers, "TEST retention" audit summaries and dates in
 * 2020 (long past the 90-day cut-off); everything left over is removed afterwards.
 */

const PHONES = ["+447700900981", "+447700900982", "+447700900983"];

afterAll(async () => {
  await sql("delete from public.bookings where client_id in (select id from public.clients where phone = any($1))", [PHONES]);
  await sql("delete from public.clients where phone = any($1)", [PHONES]);
  await sql("delete from public.audit_log where summary = 'TEST retention'");
  await sql("delete from public.request_attempts where ip_hash like 'test-retention%'");
});

async function client(phone: string, createdDaysAgo: number): Promise<string> {
  const [row] = await sql<{ id: string }>(
    "insert into public.clients (name, phone, created_at) values ('TEST Retention', $1, now() - make_interval(days => $2)) returning id",
    [phone, createdDaysAgo],
  );
  return row.id;
}

const exists = async (table: string, id: string) => (await sql(`select 1 from public.${table} where id = $1`, [id])).length === 1;

describe("purge_old_data()", () => {
  it("removes what's no longer needed and keeps the shop's history", async () => {
    const old = await client(PHONES[0], 400); // has visits: kept
    const empty = await client(PHONES[1], 400); // no bookings: removed
    const recent = await client(PHONES[2], 10); // no bookings yet, but new: kept

    const b = async (status: string, at: string) => (await insertBooking({ staff: STAFF.sam, at, status, client: old })).id;
    const declined = await b("declined", "2020-03-02 10:00");
    const cancelled = await b("cancelled", "2020-03-02 11:00");
    const unanswered = await b("pending", "2020-03-02 12:00");
    const completed = await b("completed", "2020-03-02 13:00");
    const noShow = await b("no_show", "2020-03-02 14:00");
    const [{ d }] = await sql<{ d: string }>("select to_char(now() - interval '30 days', 'YYYY-MM-DD') as d");
    const recentDeclined = await b("declined", `${d} 10:00`);

    const [{ id: oldAudit }] = await sql<{ id: string }>(
      "insert into public.audit_log (at, actor_name, action, entity, summary) values (now() - interval '91 days', 'TEST', 'settings.update', 'settings', 'TEST retention') returning id",
    );
    const [{ id: keptAudit }] = await sql<{ id: string }>(
      "insert into public.audit_log (at, actor_name, action, entity, summary) values (now() - interval '89 days', 'TEST', 'settings.update', 'settings', 'TEST retention') returning id",
    );
    await sql("insert into public.request_attempts (ip_hash, at) values ('test-retention-old', now() - interval '2 hours'), ('test-retention-new', now())");

    const { data, error } = await service().rpc("purge_old_data");
    expect(error).toBeNull();
    const counts = data as Record<string, number>;
    expect(counts.bookings).toBeGreaterThanOrEqual(3);
    expect(counts.clients).toBeGreaterThanOrEqual(1);
    expect(counts.audit).toBeGreaterThanOrEqual(1);
    expect(Object.keys(counts).sort()).toEqual(["audit", "bookings", "clients", "login_failures", "request_attempts"]);

    for (const id of [declined, cancelled, unanswered]) expect(await exists("bookings", id)).toBe(false);
    for (const id of [completed, noShow, recentDeclined]) expect(await exists("bookings", id)).toBe(true);
    expect(await exists("clients", old)).toBe(true);
    expect(await exists("clients", empty)).toBe(false);
    expect(await exists("clients", recent)).toBe(true);
    expect(await exists("audit_log", oldAudit)).toBe(false);
    expect(await exists("audit_log", keptAudit)).toBe(true);
    const attempts = await sql<{ ip_hash: string }>("select ip_hash from public.request_attempts where ip_hash like 'test-retention%'");
    expect(attempts.map((a) => a.ip_hash)).toEqual(["test-retention-new"]);

    // Running it again straight away finds nothing more of ours to remove.
    await service().rpc("purge_old_data");
    expect(await exists("bookings", completed)).toBe(true);
  });

  it("only the service role (and the nightly job) can run it", async () => {
    expect((await anon().rpc("purge_old_data")).error).not.toBeNull();
    expect((await (await as("admin")).rpc("purge_old_data")).error).not.toBeNull();
    expect((await (await as("owner")).rpc("purge_old_data")).error).not.toBeNull();
  });

  it("is scheduled nightly at 03:15 UTC", async () => {
    const jobs = await sql<{ schedule: string; command: string; active: boolean }>(
      "select schedule, command, active from cron.job where jobname = 'purge-old-data'",
    );
    expect(jobs).toEqual([{ schedule: "15 3 * * *", command: "select public.purge_old_data()", active: true }]);
  });
});
