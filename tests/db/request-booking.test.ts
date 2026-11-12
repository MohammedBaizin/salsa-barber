import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { loadAvailability } from "@/lib/booking/load";
import { availableSlots, checkSlot } from "@/lib/domain/availability";
import { addDays, dateKey, fromLondon, isoWeekday } from "@/lib/domain/time";
import { anon, as, db, service, serviceId, sql, STAFF } from "./helpers";

/** Test phones: +447700900500…599 (Ofcom drama range). Seed clients use 900001–900004. */
const phone = (n: number) => `+4477009005${String(n).padStart(2, "0")}`;

async function cleanup() {
  await sql("delete from public.bookings where client_id in (select id from public.clients where phone like '+4477009005%')");
  await sql("delete from public.clients where phone like '+4477009005%'");
  await sql("delete from public.request_attempts");
}

type RpcArgs = { service: string; staff?: string | null; start: Date; name?: string; phone?: string; replaces?: string | null; ip?: string | null };

function request(a: RpcArgs) {
  return service().rpc("request_booking", {
    p_service: a.service,
    p_staff: a.staff ?? undefined,
    p_start: a.start.toISOString(),
    p_name: a.name ?? "Test Customer",
    p_phone: a.phone ?? phone(1),
    p_replaces: a.replaces ?? undefined,
    p_ip_hash: a.ip ?? undefined,
  });
}

async function expectCode(a: RpcArgs, code: string) {
  const { error } = await request(a);
  expect(error?.message, code).toBe(code);
}

let today = "";
let monday = ""; // a Monday 2–28 days ahead, avoiding the seed's time off (+7..+9) and closure (+14)
let wednesday = "";
let friday = "";
let hairCut = "";
let oap = "";
const at = (day: string, hhmm: string) => fromLondon(day, Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)));

beforeAll(async () => {
  const [{ now }] = await sql<{ now: Date }>("select now()");
  today = dateKey(now);
  const free = (offset: number) => ![7, 8, 9, 14].includes(offset);
  const find = (isoDay: number) => {
    for (let i = 2; i <= 28; i++) if (isoWeekday(addDays(today, i)) === isoDay && free(i)) return addDays(today, i);
    throw new Error("no day");
  };
  monday = find(1);
  wednesday = find(3);
  friday = find(5);
  hairCut = await serviceId("Hair Cut");
  [{ id: oap }] = await sql<{ id: string }>("select id from public.services where name like 'OAP Cut%'");
  await cleanup();
});
afterEach(cleanup);
afterAll(cleanup);

describe("request_booking: happy path", () => {
  it("creates a pending online request with a service snapshot and a new client", async () => {
    const { data, error } = await request({ service: hairCut, staff: STAFF.sam, start: at(monday, "10:00"), name: "  Ben   Test " });
    expect(error).toBeNull();
    expect(data![0]).toMatchObject({ staff_id: STAFF.sam, is_new: true });
    const [b] = await sql<Record<string, unknown>>(
      `select b.status, b.source, b.any_barber, b.service_name, b.price_pence, b.duration_min, b.booked_name, c.name, b.manage_token::text as token
       from public.bookings b join public.clients c on c.id = b.client_id where b.id = $1`,
      [data![0].booking_id],
    );
    expect(b).toMatchObject({
      status: "pending", source: "online", any_barber: false, service_name: "Hair Cut", price_pence: 1700, duration_min: 30,
      booked_name: null, name: "Ben Test", token: data![0].manage_token,
    });
  });

  it("is idempotent: the same request twice returns the first booking", async () => {
    const a = await request({ service: hairCut, staff: STAFF.sam, start: at(monday, "10:00") });
    const b = await request({ service: hairCut, staff: STAFF.sam, start: at(monday, "10:00") });
    expect(b.data![0]).toEqual({ ...a.data![0], is_new: false });
    expect((await sql("select count(*)::int n from public.bookings b join public.clients c on c.id = b.client_id where c.phone = $1", [phone(1)]))[0].n).toBe(1);
  });

  it("never renames an existing client; a different name goes on the booking", async () => {
    await request({ service: hairCut, staff: STAFF.sam, start: at(monday, "10:00"), name: "Dad Test", phone: phone(2) });
    const { data } = await request({ service: hairCut, staff: STAFF.sam, start: at(monday, "11:00"), name: "Son Test", phone: phone(2) });
    const [row] = await sql<{ booked_name: string; name: string }>(
      "select b.booked_name, c.name from public.bookings b join public.clients c on c.id = b.client_id where b.id = $1",
      [data![0].booking_id],
    );
    expect(row).toEqual({ booked_name: "Son Test", name: "Dad Test" });
  });

  it("any barber: picks the one free longest (owner opens at 9, Sam at 10)", async () => {
    const { data } = await request({ service: hairCut, staff: null, start: at(monday, "10:00") });
    expect(data![0].staff_id).toBe(STAFF.owner);
    const [b] = await sql<{ any_barber: boolean }>("select any_barber from public.bookings where id = $1", [data![0].booking_id]);
    expect(b.any_barber).toBe(true);
  });

  it("any barber: skips a busy barber", async () => {
    await request({ service: hairCut, staff: STAFF.owner, start: at(monday, "10:00"), phone: phone(3) });
    const { data } = await request({ service: hairCut, staff: null, start: at(monday, "10:00"), phone: phone(4) });
    expect(data![0].staff_id).toBe(STAFF.sam);
  });
});

describe("request_booking: every error code", () => {
  it("service_unavailable, invalid_name, invalid_phone", async () => {
    await expectCode({ service: "6f1c2b8e-9d3a-4c5b-8e7f-1a2b3c4d5e6f", start: at(monday, "10:00") }, "service_unavailable");
    await expectCode({ service: hairCut, start: at(monday, "10:00"), name: "   " }, "invalid_name");
    await expectCode({ service: hairCut, start: at(monday, "10:00"), phone: "+441513094681" }, "invalid_phone");
  });

  it("invalid_time, too_soon, too_far", async () => {
    await expectCode({ service: hairCut, staff: STAFF.sam, start: at(monday, "10:05") }, "invalid_time");
    const soon = new Date(Math.ceil((Date.now() + 30 * 60_000) / 900_000) * 900_000);
    await expectCode({ service: hairCut, start: soon }, "too_soon");
    await expectCode({ service: hairCut, start: at(addDays(today, 40), "10:00") }, "too_far");
  });

  it("shop_closed, service_day, outside_hours", async () => {
    await expectCode({ service: hairCut, start: at(addDays(today, 14), "11:00") }, "shop_closed");
    await expectCode({ service: oap, start: at(friday, "11:00") }, "service_day");
    await expectCode({ service: hairCut, start: at(monday, "18:15") }, "outside_hours");
  });

  it("barber_unavailable (not working that day / on time off), slot_taken", async () => {
    await expectCode({ service: hairCut, staff: STAFF.sam, start: at(wednesday, "11:00") }, "barber_unavailable");
    await expectCode({ service: hairCut, staff: STAFF.sam, start: at(addDays(today, 8), "11:00") }, isoWeekday(addDays(today, 8)) === 7 ? "outside_hours" : "barber_unavailable");
    await request({ service: hairCut, staff: STAFF.sam, start: at(monday, "10:00"), phone: phone(5) });
    await expectCode({ service: hairCut, staff: STAFF.sam, start: at(monday, "10:15"), phone: phone(6) }, "slot_taken");
  });

  it("already_booked: the same person can't overlap themselves with another barber", async () => {
    await request({ service: hairCut, staff: STAFF.sam, start: at(monday, "10:00") });
    await expectCode({ service: hairCut, staff: STAFF.owner, start: at(monday, "10:15") }, "already_booked");
  });

  it("too_many_requests: at most max_open_requests waiting per phone", async () => {
    for (const t of ["10:00", "11:00", "12:00"]) {
      expect((await request({ service: hairCut, staff: STAFF.sam, start: at(monday, t) })).error).toBeNull();
    }
    await expectCode({ service: hairCut, staff: STAFF.sam, start: at(monday, "13:00") }, "too_many_requests");
  });

  it("rate_limited: 10 new requests an hour per visitor", async () => {
    await sql("insert into public.request_attempts (ip_hash) select 'visitor-x' from generate_series(1, 10)");
    await expectCode({ service: hairCut, start: at(monday, "10:00"), ip: "visitor-x" }, "rate_limited");
    expect((await request({ service: hairCut, start: at(monday, "10:00"), ip: "visitor-y" })).error).toBeNull();
  });

  it("is service-role only", async () => {
    const args = { p_service: hairCut, p_start: at(monday, "10:00").toISOString(), p_name: "x", p_phone: phone(9) };
    expect((await anon().rpc("request_booking", args)).error).not.toBeNull();
    expect((await (await as("owner")).rpc("request_booking", args)).error).not.toBeNull();
    expect((await anon().rpc("get_managed_booking", { p_token: "6f1c2b8e-9d3a-4c5b-8e7f-1a2b3c4d5e6f" })).error).not.toBeNull();
  });
});

describe("request_booking: changes (p_replaces)", () => {
  it("moves the booking in one go and keeps the customer's link", async () => {
    const first = (await request({ service: hairCut, staff: STAFF.sam, start: at(monday, "10:00") })).data![0];
    const moved = await request({ service: hairCut, staff: STAFF.sam, start: at(monday, "14:00"), replaces: first.manage_token });
    expect(moved.error).toBeNull();
    expect(moved.data![0].manage_token).toBe(first.manage_token);
    const rows = await sql<{ id: string; status: string; token: string; changed_from: string | null; cancelled_by_client: boolean }>(
      "select id, status, manage_token::text token, changed_from, cancelled_by_client from public.bookings where id in ($1, $2)",
      [first.booking_id, moved.data![0].booking_id],
    );
    const old = rows.find((r) => r.id === first.booking_id)!;
    const neu = rows.find((r) => r.id !== first.booking_id)!;
    expect(old).toMatchObject({ status: "cancelled", cancelled_by_client: true });
    expect(old.token).not.toBe(first.manage_token);
    expect(neu).toMatchObject({ status: "pending", token: first.manage_token, changed_from: first.booking_id });
  });

  it("the customer's own slot counts as free when changing (e.g. a later start overlapping it)", async () => {
    const first = (await request({ service: hairCut, staff: STAFF.sam, start: at(monday, "10:00") })).data![0];
    expect((await request({ service: hairCut, staff: STAFF.sam, start: at(monday, "10:15"), replaces: first.manage_token })).error).toBeNull();
  });

  it("if the new time fails, the old booking is untouched", async () => {
    const first = (await request({ service: hairCut, staff: STAFF.sam, start: at(monday, "10:00") })).data![0];
    await request({ service: hairCut, staff: STAFF.sam, start: at(monday, "15:00"), phone: phone(7) });
    await expectCode({ service: hairCut, staff: STAFF.sam, start: at(monday, "15:00"), replaces: first.manage_token }, "slot_taken");
    const [old] = await sql<{ status: string; token: string }>("select status, manage_token::text token from public.bookings where id = $1", [first.booking_id]);
    expect(old).toEqual({ status: "pending", token: first.manage_token });
  });

  it("not_changeable inside the cut-off", async () => {
    const [b] = await sql<{ token: string }>(
      `insert into public.bookings (client_id, staff_id, service_id, service_name, price_pence, duration_min, starts_at, ends_at, status, source)
       values ((select id from public.clients where phone = '+447700900001'), $1, $2, 'Hair Cut', 1700, 30, now() + interval '1 hour', now(), 'pending', 'online')
       returning manage_token::text token`,
      [STAFF.owner, hairCut],
    );
    try {
      await expectCode({ service: hairCut, staff: STAFF.sam, start: at(monday, "10:00"), replaces: b.token }, "not_changeable");
    } finally {
      await sql("delete from public.bookings where manage_token = $1", [b.token]);
    }
  });
});

describe("request_booking: concurrency", () => {
  it("exactly one of 8 simultaneous requests for one slot wins; the rest get slot_taken", async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => request({ service: hairCut, staff: STAFF.sam, start: at(monday, "16:00"), phone: phone(20 + i) })),
    );
    expect(results.filter((r) => !r.error)).toHaveLength(1);
    expect(results.filter((r) => r.error).map((r) => r.error!.message)).toEqual(Array(7).fill("slot_taken"));
  });
});

describe("get_managed_booking", () => {
  it("returns the booking for its token only", async () => {
    const created = (await request({ service: hairCut, staff: STAFF.sam, start: at(monday, "10:00"), name: "Ben Test" })).data![0];
    const { data } = await service().rpc("get_managed_booking", { p_token: created.manage_token });
    expect(data![0]).toMatchObject({ status: "pending", service_name: "Hair Cut", staff_name: "SAMPLE Sam", customer_name: "Ben Test", phone: phone(1), can_change: true });
    expect((await service().rpc("get_managed_booking", { p_token: "6f1c2b8e-9d3a-4c5b-8e7f-1a2b3c4d5e6f" })).data).toEqual([]);
  });
});

describe("parity: TypeScript slots are exactly what request_booking() accepts", () => {
  /** Calls request_booking in a transaction that is always rolled back; returns null (accepted) or the error code. */
  async function probe(staff: string | null, start: Date, serviceIdValue = hairCut): Promise<string | null> {
    const client = await db.connect();
    try {
      await client.query("begin");
      await client.query("select * from public.request_booking($1, $2, 'Parity Test', $3, $4)", [serviceIdValue, start.toISOString(), phone(99), staff]);
      return null;
    } catch (e) {
      return (e as Error).message;
    } finally {
      await client.query("rollback");
      client.release();
    }
  }

  for (const barber of ["sam", "any"] as const) {
    it(`agrees for ${barber === "any" ? "any barber" : "Sam"} on every quarter hour of two days`, async () => {
      // A booking that blocks some slots, to cover overlaps.
      await request({ service: hairCut, staff: STAFF.sam, start: at(monday, "12:00"), phone: phone(50) });
      const staffId = barber === "any" ? null : STAFF.sam;
      const loaded = (await loadAvailability(service(), { serviceId: hairCut, barberId: staffId, now: new Date() }))!;
      const days = availableSlots(loaded.input);
      for (const day of [monday, wednesday]) {
        const offered = new Set(days.find((d) => d.date === day)!.times.map((t) => t.start.getTime()));
        for (let m = 7 * 60; m <= 20 * 60; m += 15) {
          const start = fromLondon(day, m);
          const sqlResult = await probe(staffId, start);
          expect(sqlResult === null, `${day} ${m / 60}h: TS ${offered.has(start.getTime())} SQL ${sqlResult}`).toBe(offered.has(start.getTime()));
          if (staffId && sqlResult) {
            expect(sqlResult, `${day} ${m / 60}h code`).toBe(checkSlot(loaded.input, loaded.input.barbers[0], start));
          }
        }
      }
    });
  }

  it("rejects times just outside the window with the same codes as TypeScript", async () => {
    const loaded = (await loadAvailability(service(), { serviceId: hairCut, barberId: STAFF.sam, now: new Date() }))!;
    const sam = loaded.input.barbers[0];
    for (const start of [at(monday, "10:05"), at(monday, "09:45"), at(monday, "18:15"), at(addDays(today, 31), "10:00"), at(wednesday, "10:00")]) {
      expect(await probe(STAFF.sam, start), start.toISOString()).toBe(checkSlot(loaded.input, sam, start));
    }
  });

  it("agrees on bookable days (OAP Cut)", async () => {
    const loaded = (await loadAvailability(service(), { serviceId: oap, barberId: null, now: new Date() }))!;
    const days = availableSlots(loaded.input);
    expect(days.find((d) => d.date === friday)!.times).toEqual([]);
    expect(await probe(null, at(friday, "11:00"), oap)).toBe("service_day");
    expect(await probe(null, at(monday, "11:00"), oap)).toBeNull();
  });
});
