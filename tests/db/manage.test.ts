import { afterAll, describe, expect, it } from "vitest";
import { anon, as, cleanupBookings, insertBooking, service, sql, STAFF } from "./helpers";

/** cancel_managed_booking() (spec §4.4). Test bookings are in 2030 (removed by cleanupBookings) or marked below. */

const soon: string[] = [];
afterAll(async () => {
  await sql("delete from public.bookings where id = any($1::uuid[])", [soon]);
  await cleanupBookings();
});

const status = async (id: string) => (await sql<{ status: string; cancelled_by_client: boolean }>(
  "select status, cancelled_by_client from public.bookings where id = $1", [id],
))[0];

describe("cancel_managed_booking()", () => {
  it("cancels a pending or confirmed booking once, marked as cancelled by the customer, and isn't logged as staff", async () => {
    for (const st of ["pending", "confirmed"]) {
      const b = await insertBooking({ staff: STAFF.sam, at: st === "pending" ? "2030-04-02 10:00" : "2030-04-02 11:00", status: st, source: "online" });
      const { data, error } = await service().rpc("cancel_managed_booking", { p_token: b.manage_token });
      expect(error).toBeNull();
      expect(data?.[0]?.booking_id).toBe(b.id);
      expect(await status(b.id)).toEqual({ status: "cancelled", cancelled_by_client: true });
      const again = await service().rpc("cancel_managed_booking", { p_token: b.manage_token });
      expect(again.error?.message).toBe("not_changeable");
      expect(await sql("select 1 from public.audit_log where entity_id = $1 and action = 'booking.cancel'", [b.id])).toEqual([]);
    }
  });

  it("refuses after the cut-off, for finished bookings and for unknown tokens", async () => {
    const [{ id, manage_token }] = await sql<{ id: string; manage_token: string }>(
      `insert into public.bookings (client_id, staff_id, service_id, service_name, price_pence, duration_min, starts_at, ends_at, status, source)
       select c.id, $1, s.id, s.name, s.price_pence, s.duration_min, date_trunc('minute', now()) + interval '61 minutes',
         date_trunc('minute', now()) + interval '61 minutes', 'confirmed', 'online'
       from public.clients c, public.services s where c.phone = '+447700900004' and s.name = 'Hair Cut'
       returning id, manage_token`,
      [STAFF.jamie],
    );
    soon.push(id);
    const [{ cutoff }] = await sql<{ cutoff: number }>("select change_cutoff_minutes as cutoff from public.settings");
    if (cutoff > 60) {
      expect((await service().rpc("cancel_managed_booking", { p_token: manage_token })).error?.message).toBe("not_changeable");
      expect((await status(id)).status).toBe("confirmed");
    }

    const done = await insertBooking({ staff: STAFF.sam, at: "2030-04-02 12:00", status: "completed" });
    expect((await service().rpc("cancel_managed_booking", { p_token: done.manage_token })).error?.message).toBe("not_changeable");
    expect((await service().rpc("cancel_managed_booking", { p_token: "00000000-0000-4000-8000-000000000000" })).error?.message).toBe("not_changeable");
  });

  it("only the server (secret key) can call it", async () => {
    const b = await insertBooking({ staff: STAFF.sam, at: "2030-04-02 13:00", status: "pending", source: "online" });
    expect((await anon().rpc("cancel_managed_booking", { p_token: b.manage_token })).error).not.toBeNull();
    expect((await (await as("owner")).rpc("cancel_managed_booking", { p_token: b.manage_token })).error).not.toBeNull();
    expect((await status(b.id)).status).toBe("pending");
  });
});
