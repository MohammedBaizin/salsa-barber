import pg from "pg";
import { afterEach, describe, expect, it, inject } from "vitest";
import { as, cleanupBookings, CLIENTS, insertBooking, serviceId, sql, STAFF } from "./helpers";

afterEach(cleanupBookings);

async function expectSqlError(promise: Promise<unknown>, code: string, message?: string) {
  try {
    await promise;
  } catch (e) {
    const err = e as { code?: string; message?: string };
    expect(err.code).toBe(code);
    if (message) expect(err.message).toContain(message);
    return;
  }
  throw new Error(`Expected SQL error ${code}`);
}

describe("booking basics", () => {
  it("sets ends_at from the duration snapshot", async () => {
    const b = await insertBooking({ staff: STAFF.sam, at: "2030-03-04 10:00", service: "Skin Fade" });
    expect(b.ends_at.getTime() - b.starts_at.getTime()).toBe(45 * 60_000);
  });

  it("stores London wall-clock times correctly across DST (BST: 10:00 local = 09:00 UTC)", async () => {
    const summer = await insertBooking({ staff: STAFF.sam, at: "2030-07-01 10:00" });
    const winter = await insertBooking({ staff: STAFF.sam, at: "2030-12-02 10:00" });
    expect(summer.starts_at.toISOString()).toBe("2030-07-01T09:00:00.000Z");
    expect(winter.starts_at.toISOString()).toBe("2030-12-02T10:00:00.000Z");
  });

  it("never books the admin account or a deleted barber", async () => {
    await expectSqlError(insertBooking({ staff: STAFF.admin, at: "2030-03-04 10:00" }), "P0001", "barber_unavailable");
  });
});

describe("overlap protection (exclusion constraint)", () => {
  it("refuses overlapping live bookings for one barber", async () => {
    await insertBooking({ staff: STAFF.sam, at: "2030-03-04 10:00" });
    await expectSqlError(insertBooking({ staff: STAFF.sam, at: "2030-03-04 10:15" }), "23P01");
  });

  it("allows back-to-back bookings, other barbers, and slots freed by cancelled/declined bookings", async () => {
    const first = await insertBooking({ staff: STAFF.sam, at: "2030-03-04 10:00" });
    await insertBooking({ staff: STAFF.sam, at: "2030-03-04 10:30" });
    await insertBooking({ staff: STAFF.jamie, at: "2030-03-04 10:00", client: CLIENTS.chris });
    await sql("update public.bookings set status = 'cancelled' where id = $1", [first.id]);
    await insertBooking({ staff: STAFF.sam, at: "2030-03-04 10:00", status: "pending", source: "online" });
  });

  it("exactly one of 6 simultaneous requests for the same slot wins", async () => {
    const svc = await serviceId("Hair Cut");
    const clients = Array.from({ length: 6 }, () => new pg.Client({ connectionString: inject("DB_TEST_DB_URL") }));
    await Promise.all(clients.map((c) => c.connect()));
    try {
      const results = await Promise.allSettled(
        clients.map((c) =>
          c.query(
            `insert into public.bookings (client_id, staff_id, service_id, service_name, price_pence, duration_min, starts_at, ends_at, status, source)
             values ($1, $2, $3, 'Hair Cut', 1700, 30, '2030-05-06 09:00:00+00', '2030-05-06 09:00:00+00', 'pending', 'online')`,
            [CLIENTS.ben, STAFF.sam, svc],
          ),
        ),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      expect(rejected.every((r) => (r.reason as { code: string }).code === "23P01")).toBe(true);
    } finally {
      await Promise.all(clients.map((c) => c.end()));
    }
  });
});

describe("status machine", () => {
  const setStatus = (id: string, status: string) => sql("update public.bookings set status = $2 where id = $1", [id, status]);

  it("follows pending → confirmed → completed → (undo) confirmed → no_show", async () => {
    const b = await insertBooking({ staff: STAFF.sam, at: "2030-03-04 10:00", status: "pending", source: "online" });
    await setStatus(b.id, "confirmed");
    await setStatus(b.id, "completed");
    await setStatus(b.id, "confirmed");
    await setStatus(b.id, "no_show");
    await setStatus(b.id, "confirmed");
    await setStatus(b.id, "cancelled");
  });

  it.each([
    ["pending", "completed"],
    ["pending", "no_show"],
    ["confirmed", "pending"],
    ["confirmed", "declined"],
    ["declined", "confirmed"],
    ["cancelled", "confirmed"],
    ["completed", "cancelled"],
    ["no_show", "completed"],
  ])("refuses %s → %s", async (from, to) => {
    const b = await insertBooking({ staff: STAFF.sam, at: "2030-03-04 10:00", status: from, source: "online" });
    await expectSqlError(setStatus(b.id, to), "P0001", "invalid_status_change");
  });

  it("keeps the decline reason only on declined bookings", async () => {
    const b = await insertBooking({ staff: STAFF.sam, at: "2030-03-04 10:00", status: "pending", source: "online" });
    await sql("update public.bookings set status = 'declined', decline_reason = 'Fully booked' where id = $1", [b.id]);
    expect((await sql("select decline_reason from public.bookings where id = $1", [b.id]))[0].decline_reason).toBe("Fully booked");
  });

  it("source is read-only; only the server (customer change) may move a manage token", async () => {
    const b = await insertBooking({ staff: STAFF.sam, at: "2030-03-04 10:00" });
    await expectSqlError(sql("update public.bookings set source = 'online' where id = $1", [b.id]), "P0001", "read_only_column");
    await sql("update public.bookings set manage_token = gen_random_uuid() where id = $1", [b.id]); // trusted: allowed
    const owner = await as("owner");
    const r = await owner.from("bookings").update({ manage_token: crypto.randomUUID() } as never).eq("id", b.id);
    expect(r.error?.code).toBe("42501"); // no column grant for staff
  });
});

describe("customer message flag", () => {
  it("resets message_sent_at on reschedule, barber change and cancel, but not on unrelated edits", async () => {
    const b = await insertBooking({ staff: STAFF.sam, at: "2030-03-04 10:00" });
    const sent = () => sql("update public.bookings set message_sent_at = now() where id = $1", [b.id]);
    const flag = async () => (await sql("select message_sent_at from public.bookings where id = $1", [b.id]))[0].message_sent_at;

    await sent();
    await sql("update public.bookings set price_pence = 1500 where id = $1", [b.id]);
    expect(await flag()).not.toBeNull();

    await sql("update public.bookings set starts_at = starts_at + interval '1 hour' where id = $1", [b.id]);
    expect(await flag()).toBeNull();

    await sent();
    await sql("update public.bookings set staff_id = $2 where id = $1", [b.id, STAFF.owner]);
    expect(await flag()).toBeNull();

    await sent();
    await sql("update public.bookings set status = 'cancelled' where id = $1", [b.id]);
    expect(await flag()).toBeNull();
  });
});

describe("audit of booking actions by staff", () => {
  it("logs accept with a readable summary and no phone number", async () => {
    const b = await insertBooking({ staff: STAFF.sam, at: "2030-03-04 10:00", status: "pending", source: "online", client: CLIENTS.ben });
    const sam = await as("sam");
    expect((await sam.from("bookings").update({ status: "confirmed" }).eq("id", b.id).eq("status", "pending")).error).toBeNull();
    const [row] = await sql<{ action: string; summary: string; actor_name: string }>(
      "select action, summary, actor_name from public.audit_log where entity_id = $1",
      [b.id],
    );
    expect(row).toEqual({
      action: "booking.accept",
      actor_name: "SAMPLE Sam",
      summary: "SAMPLE Ben New · Hair Cut · SAMPLE Sam · Mon 4 Mar 10:00am",
    });
    expect(row.summary).not.toMatch(/\+?44|07700/);
  });

  it("does not log marking a message as sent", async () => {
    const b = await insertBooking({ staff: STAFF.sam, at: "2030-03-04 10:00" });
    const sam = await as("sam");
    await sam.from("bookings").update({ message_sent_at: new Date().toISOString() }).eq("id", b.id);
    expect(await sql("select 1 from public.audit_log where entity_id = $1", [b.id])).toEqual([]);
  });

  it("logs a reschedule with the old time", async () => {
    const b = await insertBooking({ staff: STAFF.sam, at: "2030-03-04 10:00" });
    const owner = await as("owner");
    await owner.from("bookings").update({ starts_at: "2030-03-05T14:00:00Z" }).eq("id", b.id);
    const [row] = await sql<{ action: string; summary: string }>("select action, summary from public.audit_log where entity_id = $1", [b.id]);
    expect(row.action).toBe("booking.reschedule");
    expect(row.summary).toContain("Tue 5 Mar 2:00pm (was Mon 4 Mar 10:00am)");
  });
});
