import { afterEach, describe, expect, it } from "vitest";
import { anon, as, CLIENTS, sql, STAFF } from "./helpers";

type Row = { id: string | null; name: string | null; visits: number | null; n_all: number; n_due_back: number; n_regular: number; n_new: number };

async function list(user: "owner" | "sam" | "jamie" | "admin", args: Record<string, unknown> = {}) {
  const client = await as(user);
  const { data, error } = await client.rpc("client_list", args as never);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Row[];
  return { rows: rows.filter((r) => r.id), counts: rows[0], names: rows.filter((r) => r.id).map((r) => r.name) };
}

describe("client_list()", () => {
  it("owner: labels and counts match the seed (Alex regular, Ben new, Chris due back, Dan new)", async () => {
    const all = await list("owner");
    expect(all.names).toEqual(expect.arrayContaining(["SAMPLE Alex Regular", "SAMPLE Ben New", "SAMPLE Chris Dueback", "SAMPLE Dan Noshow"]));
    expect((await list("owner", { p_filter: "regular" })).names).toEqual(["SAMPLE Alex Regular"]);
    expect((await list("owner", { p_filter: "due_back" })).names).toEqual(["SAMPLE Chris Dueback"]);
    expect((await list("owner", { p_filter: "new" })).names).toEqual(expect.arrayContaining(["SAMPLE Ben New", "SAMPLE Dan Noshow"]));
    expect(all.counts).toMatchObject({ n_regular: 1, n_due_back: 1 });
    expect(Number(all.counts.n_all)).toBe(all.rows.length);
  });

  it("sorting: all by name; regulars by visits; new by newest", async () => {
    const all = await list("owner");
    const sorted = [...all.names].sort((a, b) => a!.localeCompare(b!, "en-GB", { sensitivity: "base" }));
    expect(all.names).toEqual(sorted);
  });

  it("search by name (any case) or by phone digits; counts follow the search", async () => {
    const byName = await list("owner", { p_name: "dueBACK" });
    expect(byName.names).toEqual(["SAMPLE Chris Dueback"]);
    expect(byName.counts).toMatchObject({ n_all: 1, n_due_back: 1, n_regular: 0, n_new: 0 });
    expect((await list("owner", { p_phone: "7700900004" })).names).toEqual(["SAMPLE Dan Noshow"]);
    const none = await list("owner", { p_name: "nobody-called-this" });
    expect(none.rows).toEqual([]);
    expect(none.counts).toMatchObject({ n_all: 0 });
  });

  it("'Clients of' a barber: anyone with at least one booking with them", async () => {
    expect((await list("owner", { p_staff: STAFF.owner })).names).toEqual(["SAMPLE Ben New", "SAMPLE Chris Dueback"]);
    expect((await list("owner", { p_staff: STAFF.jamie })).names).toEqual(["SAMPLE Dan Noshow"]);
  });

  it("barbers only see their own clients, with only their own visits counted", async () => {
    const sam = await list("sam");
    expect(sam.names).toEqual(["SAMPLE Alex Regular", "SAMPLE Ben New"]);
    expect(sam.rows.find((r) => r.name === "SAMPLE Alex Regular")?.visits).toBe(3);
    expect((await list("jamie")).names).toEqual(["SAMPLE Dan Noshow"]);
    // Asking for someone else's clients doesn't widen it.
    expect((await list("jamie", { p_staff: STAFF.owner })).names).toEqual([]);
  });

  it("pages of at most 100", async () => {
    const page = await list("owner", { p_limit: 2, p_offset: 1 });
    const all = await list("owner");
    expect(page.names).toEqual(all.names.slice(1, 3));
    expect(Number(page.counts.n_all)).toBe(all.rows.length);
  });

  it("not for signed-out visitors", async () => {
    const { error } = await anon().rpc("client_list", {} as never);
    expect(error?.code).toBe("42501");
  });
});

describe("delete_client()", () => {
  const PHONE = "+447700900851";
  let made: string | null = null;

  afterEach(async () => {
    await sql("delete from public.audit_log where summary like '%E2E Del%' or summary like '%Deleted client%' and at > now() - interval '5 minutes'");
    if (made) await sql("delete from public.bookings where id in (select id from public.bookings where client_id is null and created_at > now() - interval '5 minutes')");
    await sql("delete from public.bookings where client_id in (select id from public.clients where phone = $1)", [PHONE]);
    await sql("delete from public.clients where phone = $1", [PHONE]);
    made = null;
  });

  async function setup() {
    const [c] = await sql<{ id: string }>("insert into public.clients (name, phone) values ('E2E Del Person', $1) returning id", [PHONE]);
    made = c.id;
    const insert = (when: string, status: string, booked: string | null) =>
      sql<{ id: string }>(
        `insert into public.bookings (client_id, staff_id, service_id, service_name, price_pence, duration_min, starts_at, ends_at, status, source, booked_name)
         select $1, $2, v.id, v.name, v.price_pence, v.duration_min, now() + $3::interval, now(), $4, 'staff', $5
         from public.services v where v.name = 'Hair Cut' returning id`,
        [c.id, STAFF.jamie, when, status, booked],
      ).then((r) => r[0].id);
    const past = await insert("-30 days", "completed", "E2E Del Nickname");
    const future = await insert("30 days", "confirmed", null);
    // A staff change on the future booking leaves an activity entry with the name in it.
    const owner = await as("owner");
    await owner.from("bookings").update({ price_pence: 1500 }).eq("id", future);
    await owner.from("clients").update({ name: "E2E Del Person" }).eq("id", c.id); // no change: not logged
    return { id: c.id, past, future };
  }

  it("cancels future bookings, keeps past revenue without a name, and scrubs the name from the activity log", async () => {
    const { id, past, future } = await setup();
    const before = await sql("select count(*)::int as n from public.audit_log where summary like '%E2E Del%'");
    expect(before[0].n).toBeGreaterThan(0);

    const owner = await as("owner");
    const { data, error } = await owner.rpc("delete_client", { p_id: id });
    expect(error).toBeNull();
    expect(data).toBe(1);

    expect(await sql("select 1 from public.clients where id = $1", [id])).toEqual([]);
    const rows = await sql<{ id: string; status: string; client_id: string | null; booked_name: string | null; price_pence: number }>(
      "select id, status, client_id, booked_name, price_pence from public.bookings where id = any($1::uuid[])",
      [[past, future]],
    );
    expect(rows.find((r) => r.id === past)).toMatchObject({ status: "completed", client_id: null, booked_name: null, price_pence: 1700 });
    expect(rows.find((r) => r.id === future)).toMatchObject({ status: "cancelled", client_id: null });

    expect((await sql("select count(*)::int as n from public.audit_log where summary like '%E2E Del%'"))[0].n).toBe(0);
    const entries = await sql<{ action: string; summary: string }>(
      "select action, summary from public.audit_log where (entity = 'client' and entity_id = $1) or (entity = 'booking' and entity_id = any($2::text[])) order by id",
      [id, [past, future]],
    );
    expect(entries.map((e) => e.action)).toEqual(["booking.service_change", "booking.cancel", "client.delete"]);
    expect(entries.at(-1)!.summary).toBe("Deleted client");
    expect(entries.every((e) => e.summary.startsWith("Deleted client"))).toBe(true);
  });

  it("owner/admin only; unknown ids are refused", async () => {
    const { id } = await setup();
    const sam = await as("sam");
    expect((await sam.rpc("delete_client", { p_id: id })).error?.code).toBe("42501");
    const jamie = await as("jamie");
    expect((await jamie.rpc("delete_client", { p_id: id })).error?.code).toBe("42501");
    const admin = await as("admin");
    expect((await admin.rpc("delete_client", { p_id: CLIENTS.alex.replace(/1$/, "9") })).error?.message).toBe("not_found");
    expect(await sql("select 1 from public.clients where id = $1", [id])).toHaveLength(1);
  });
});
