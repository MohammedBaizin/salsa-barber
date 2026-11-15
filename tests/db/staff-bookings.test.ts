import { afterEach, describe, expect, it } from "vitest";
import { as, CLIENTS, serviceId, sql, STAFF } from "./helpers";

/** Test clients: 07700 9008xx. Bookings made here are tracked and removed after each test. */
const PHONE = "+447700900801";
const PHONE_2 = "+447700900802";
const made: string[] = [];

afterEach(async () => {
  if (made.length) {
    await sql("delete from public.audit_log where entity = 'booking' and entity_id = any($1::text[])", [made]);
    await sql("delete from public.bookings where id = any($1::uuid[])", [made]);
    made.length = 0;
  }
  await sql("delete from public.clients where phone like '+4477009008%'");
});

/** London wall clock `days` from today at "HH:MM", as an ISO string. */
async function at(days: number, hhmm: string): Promise<string> {
  const [row] = await sql<{ t: Date }>(
    "select (((now() at time zone 'Europe/London')::date + $1::int) + $2::time) at time zone 'Europe/London' as t",
    [days, hhmm],
  );
  return row.t.toISOString();
}

type Rpc = "create_walk_in" | "create_staff_booking";
type Args = { p_staff: string; p_service: string; p_start: string; p_name?: string | null; p_phone?: string | null };

async function call(user: keyof typeof STAFF, rpc: Rpc, args: Args) {
  const client = await as(user);
  const { data, error } = await client.rpc(rpc, args as never);
  if (data) made.push(data as string);
  return { id: data as string | null, error };
}

async function ok(user: keyof typeof STAFF, rpc: Rpc, args: Args): Promise<string> {
  const { id, error } = await call(user, rpc, args);
  expect(error).toBeNull();
  return id!;
}

async function fails(user: keyof typeof STAFF, rpc: Rpc, args: Args, message: string, code = "P0001") {
  const { error } = await call(user, rpc, args);
  expect(error?.message).toBe(message);
  expect(error?.code).toBe(code);
}

async function booking(id: string) {
  const [row] = await sql<{
    status: string; source: string; client_id: string | null; booked_name: string | null; price_pence: number; staff_id: string;
  }>("select status, source, client_id, booked_name, price_pence, staff_id from public.bookings where id = $1", [id]);
  return row;
}

describe("create_walk_in()", () => {
  it("anonymous walk-in: confirmed, current price, no client, audited as a walk-in", async () => {
    const svc = await serviceId("Skin Fade");
    const id = await ok("sam", "create_walk_in", { p_staff: STAFF.sam, p_service: svc, p_start: await at(1, "07:00") });
    expect(await booking(id)).toMatchObject({ status: "confirmed", source: "walk_in", client_id: null, booked_name: null, price_pence: 1800 });
    const [audit] = await sql<{ action: string; actor_name: string; summary: string }>(
      "select action, actor_name, summary from public.audit_log where entity_id = $1",
      [id],
    );
    expect(audit).toMatchObject({ action: "booking.walk_in", actor_name: "Sardar" });
    expect(audit.summary).toMatch(/^Walk-in customer · Skin Fade · Sardar · /);
  });

  it("with a mobile: creates the client; an existing number is reused and never renamed", async () => {
    const svc = await serviceId("Hair Cut");
    const first = await ok("sam", "create_walk_in", {
      p_staff: STAFF.sam, p_service: svc, p_start: await at(1, "07:00"), p_name: "  New   Walkin ", p_phone: PHONE,
    });
    const [client] = await sql<{ id: string; name: string }>("select id, name from public.clients where phone = $1", [PHONE]);
    expect(client.name).toBe("New Walkin");
    expect(await booking(first)).toMatchObject({ client_id: client.id, booked_name: null });

    const second = await ok("sam", "create_walk_in", {
      p_staff: STAFF.sam, p_service: svc, p_start: await at(1, "07:30"), p_name: "Someone Else", p_phone: PHONE,
    });
    expect(await booking(second)).toMatchObject({ client_id: client.id, booked_name: "Someone Else" });
    expect((await sql("select name from public.clients where id = $1", [client.id]))[0]).toEqual({ name: "New Walkin" });

    // A known number without a name is fine.
    const third = await ok("sam", "create_walk_in", { p_staff: STAFF.sam, p_service: svc, p_start: await at(1, "08:00"), p_phone: PHONE });
    expect(await booking(third)).toMatchObject({ client_id: client.id, booked_name: null });
  });

  it("customer rules: a name needs a mobile; a new number needs a name; UK mobiles only", async () => {
    const svc = await serviceId("Hair Cut");
    const start = await at(1, "07:00");
    await fails("sam", "create_walk_in", { p_staff: STAFF.sam, p_service: svc, p_start: start, p_name: "Jo" }, "name_needs_phone");
    await fails("sam", "create_walk_in", { p_staff: STAFF.sam, p_service: svc, p_start: start, p_phone: PHONE_2 }, "invalid_name");
    await fails("sam", "create_walk_in", { p_staff: STAFF.sam, p_service: svc, p_start: start, p_name: "Jo", p_phone: "+441513094681" }, "invalid_phone");
    await fails("sam", "create_walk_in", { p_staff: STAFF.sam, p_service: svc, p_start: start, p_name: "x".repeat(81), p_phone: PHONE_2 }, "invalid_name");
  });

  it("time rules: 5-minute grid, from a week ago to the end of tomorrow", async () => {
    const svc = await serviceId("Hair Cut");
    await fails("sam", "create_walk_in", { p_staff: STAFF.sam, p_service: svc, p_start: await at(1, "07:02") }, "not_on_grid");
    await fails("sam", "create_walk_in", { p_staff: STAFF.sam, p_service: svc, p_start: await at(-8, "07:00") }, "walk_in_window");
    await fails("sam", "create_walk_in", { p_staff: STAFF.sam, p_service: svc, p_start: await at(2, "07:00") }, "walk_in_window");
    // A week back is allowed (recording a walk-in afterwards).
    await ok("sam", "create_walk_in", { p_staff: STAFF.sam, p_service: svc, p_start: await at(-7, "06:00") });
  });

  it("barbers only for themselves; owner/admin for any bookable barber; never admin or a switched-off barber", async () => {
    const svc = await serviceId("Hair Cut");
    const start = await at(1, "07:00");
    await fails("sam", "create_walk_in", { p_staff: STAFF.jamie, p_service: svc, p_start: start }, "not_allowed", "42501");
    await ok("owner", "create_walk_in", { p_staff: STAFF.jamie, p_service: svc, p_start: start });
    await ok("admin", "create_walk_in", { p_staff: STAFF.sam, p_service: svc, p_start: start });
    await fails("owner", "create_walk_in", { p_staff: STAFF.admin, p_service: svc, p_start: start }, "barber_unavailable");
    await fails("owner", "create_walk_in", { p_staff: STAFF.off, p_service: svc, p_start: start }, "barber_unavailable");
  });

  it("refuses overlaps and switched-off services", async () => {
    const svc = await serviceId("Hair Cut");
    const start = await at(1, "07:00");
    await ok("sam", "create_walk_in", { p_staff: STAFF.sam, p_service: svc, p_start: start });
    await fails("sam", "create_walk_in", { p_staff: STAFF.sam, p_service: svc, p_start: await at(1, "07:15") }, "overlap", "23P01");
    await sql("update public.services set active = false where id = $1", [svc]);
    try {
      await fails("sam", "create_walk_in", { p_staff: STAFF.sam, p_service: svc, p_start: await at(1, "08:00") }, "service_unavailable");
    } finally {
      await sql("update public.services set active = true where id = $1", [svc]);
    }
  });

  it("signed-out visitors can't call it", async () => {
    const { anon } = await import("./helpers");
    const { error } = await anon().rpc("create_walk_in", { p_staff: STAFF.sam, p_service: await serviceId("Hair Cut"), p_start: await at(1, "07:00") });
    expect(error?.code).toBe("42501");
  });
});

describe("create_staff_booking() (phone bookings)", () => {
  it("confirmed, source staff, client found by number without renaming", async () => {
    const svc = await serviceId("Hair Cut");
    const id = await ok("owner", "create_staff_booking", {
      p_staff: STAFF.sam, p_service: svc, p_start: await at(20, "07:05"), p_name: "Alex Again", p_phone: "+447700900001",
    });
    expect(await booking(id)).toMatchObject({ status: "confirmed", source: "staff", client_id: CLIENTS.alex, booked_name: "Alex Again" });
    const [audit] = await sql<{ action: string }>("select action from public.audit_log where entity_id = $1", [id]);
    expect(audit.action).toBe("booking.phone");
  });

  it("needs a name and a mobile", async () => {
    const svc = await serviceId("Hair Cut");
    const start = await at(20, "07:00");
    await fails("owner", "create_staff_booking", { p_staff: STAFF.sam, p_service: svc, p_start: start, p_name: "", p_phone: PHONE }, "invalid_name");
    await fails("owner", "create_staff_booking", { p_staff: STAFF.sam, p_service: svc, p_start: start, p_name: "Jo", p_phone: "" }, "invalid_phone");
  });

  it("future only, up to a year ahead, on the 5-minute grid", async () => {
    const svc = await serviceId("Hair Cut");
    const args = { p_staff: STAFF.sam, p_service: svc, p_name: "Jo", p_phone: PHONE };
    await fails("owner", "create_staff_booking", { ...args, p_start: await at(-1, "10:00") }, "in_the_past");
    await fails("owner", "create_staff_booking", { ...args, p_start: await at(366, "10:00") }, "too_far");
    await fails("owner", "create_staff_booking", { ...args, p_start: await at(20, "10:01") }, "not_on_grid");
    await ok("owner", "create_staff_booking", { ...args, p_start: await at(365, "07:00") });
  });

  it("barbers book only themselves", async () => {
    const svc = await serviceId("Hair Cut");
    const args = { p_service: svc, p_start: await at(20, "07:00"), p_name: "Jo", p_phone: PHONE };
    await fails("jamie", "create_staff_booking", { ...args, p_staff: STAFF.sam }, "not_allowed", "42501");
    await ok("jamie", "create_staff_booking", { ...args, p_staff: STAFF.jamie });
  });
});
