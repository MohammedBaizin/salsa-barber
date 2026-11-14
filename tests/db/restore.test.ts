import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildBackup } from "@/lib/backup/build";
import type { Backup } from "@/lib/backup/format";
import { anon, as, service, sql, STAFF } from "./helpers";

/**
 * restore_backup() (spec §8.11). DB test files run one at a time, and this one starts from a real backup of the
 * current data and restores it at the end, so everything is exactly as before.
 */

let original: Backup;
let adminUser: string;
const svc = service();
const restore = (tables: unknown) => svc.rpc("restore_backup", { p_tables: tables as never, p_admin_user: adminUser });
const copy = (): Backup["tables"] => structuredClone(original.tables);

beforeAll(async () => {
  original = await buildBackup(svc, "Salsa Barber");
  [{ user_id: adminUser }] = await sql<{ user_id: string }>("select user_id from public.staff where id = $1", [STAFF.admin]);
});

afterAll(async () => {
  const { error } = await restore(original.tables);
  if (error) throw new Error(`Couldn't put the database back: ${error.message}`);
});

const count = async (table: string) => (await sql<{ n: number }>(`select count(*)::int as n from public.${table}`))[0].n;

describe("restore_backup()", () => {
  it("puts every table back exactly, without new activity entries; keeps audit flags; never lowers the log's sequence", async () => {
    await sql("insert into public.clients (name, phone) values ('TEST Restore', '+447700900991')");
    await sql("delete from public.reviews");
    const [{ max }] = await sql<{ max: string }>("select coalesce(max(id), 0)::text as max from public.audit_log");
    const adminFlags = await sql<{ id: string }>("select id::text from public.audit_log where actor_is_admin order by id");

    const { data, error } = await restore(original.tables);
    expect(error).toBeNull();
    expect(data).toMatchObject({ clients: original.tables.clients.length, reviews: original.tables.reviews.length });
    expect(await sql("select 1 from public.clients where phone = '+447700900991'")).toEqual([]);
    for (const t of ["services", "staff", "clients", "bookings", "reviews", "audit_log", "closures", "time_off"]) {
      expect(await count(t), t).toBe(original.tables[t as keyof Backup["tables"]].length);
    }
    expect(await sql<{ id: string }>("select id::text from public.audit_log where actor_is_admin order by id")).toEqual(
      adminFlags.filter((r) => original.tables.audit_log.some((a) => String(a.id) === r.id)),
    );
    const [{ next }] = await sql<{ next: string }>("select nextval(pg_get_serial_sequence('public.audit_log', 'id'))::text as next");
    expect(BigInt(next)).toBeGreaterThan(BigInt(max));
  });

  it("refuses a backup whose columns or tables don't match; nothing changes", async () => {
    await sql("insert into public.clients (name, phone) values ('TEST Keep', '+447700900992')");
    const extra = copy();
    extra.clients = [...extra.clients, { ...extra.clients[0], id: crypto.randomUUID(), phone: "+447700900993", nickname: "x" }];
    expect((await restore(extra)).error?.message).toMatch(/^backup_mismatch: columns of clients differ/);
    const { bookings: _b, ...missing } = copy();
    void _b;
    expect((await restore(missing)).error?.message).toMatch(/^backup_mismatch: table bookings is missing/);
    expect(await sql("select 1 from public.clients where phone = '+447700900992'")).toHaveLength(1);
    await sql("delete from public.clients where phone = '+447700900992'");
  });

  it("skips photos whose files are gone, unlinks missing logins, keeps the restoring admin active", async () => {
    const t = copy();
    const photo = t.gallery_photos[0] ?? null;
    t.gallery_photos = [...t.gallery_photos, { ...(photo ?? {}), id: crypto.randomUUID(), path: "photos/gone-since.webp", alt: "TEST gone", visible: false, in_hero: false, sort: 999, created_at: new Date().toISOString() }];
    t.staff = t.staff.map((s) =>
      s.id === STAFF.admin ? { ...s, active: false } : s.id === STAFF.jamie ? { ...s, user_id: "00000000-0000-4000-8000-0000000000ff" } : s,
    );
    const { error } = await restore(t);
    expect(error).toBeNull();
    expect(await sql("select 1 from public.gallery_photos where path = 'photos/gone-since.webp'")).toEqual([]);
    expect((await sql<{ user_id: string | null }>("select user_id from public.staff where id = $1", [STAFF.jamie]))[0].user_id).toBeNull();
    expect((await sql<{ active: boolean }>("select active from public.staff where id = $1", [STAFF.admin]))[0].active).toBe(true);
    // Put Jamie's login back for the tests that follow.
    await restore(original.tables);
  });

  it("only the server can run it", async () => {
    expect((await anon().rpc("restore_backup", { p_tables: {} as never, p_admin_user: adminUser })).error).not.toBeNull();
    expect((await (await as("admin")).rpc("restore_backup", { p_tables: {} as never, p_admin_user: adminUser })).error).not.toBeNull();
  });

  it("backup events are logged by admins only", async () => {
    expect((await (await as("owner")).rpc("log_backup_event", { p_action: "backup.download", p_summary: "x" })).error?.code).toBe("42501");
    const admin = await as("admin");
    expect((await admin.rpc("log_backup_event", { p_action: "booking.accept", p_summary: "x" })).error?.code).toBe("42501");
    expect((await admin.rpc("log_backup_event", { p_action: "backup.download", p_summary: "TEST download" })).error).toBeNull();
    const [row] = await sql<{ actor_is_admin: boolean; entity: string }>("select actor_is_admin, entity from public.audit_log where summary = 'TEST download'");
    expect(row).toEqual({ actor_is_admin: true, entity: "backup" });
    await sql("delete from public.audit_log where summary = 'TEST download'");
  });
});
