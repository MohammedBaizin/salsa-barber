import { afterEach, describe, expect, it } from "vitest";
import { anon, as, cleanupBookings, insertBooking, serviceId, service, sql, STAFF } from "./helpers";

const made: string[] = [];

afterEach(async () => {
  await cleanupBookings();
  if (made.length) {
    await sql("delete from public.audit_log where entity = 'staff' and entity_id = any($1::text[])", [made]);
    await sql("delete from public.bookings where staff_id = any($1::uuid[])", [made]);
    await sql("delete from public.staff where id = any($1::uuid[])", [made]);
    made.length = 0;
  }
});

/** A temporary barber (no login) with a service and some time off. */
async function tempStaff(username: string, role = "barber"): Promise<string> {
  const [row] = await sql<{ id: string }>(
    `insert into public.staff (username, display_name, role, bookable, title, photo_path, weekly_hours)
     values ($1, $2, $3, $4, 'Barber', 'staff/old.webp', '{"1":{"open":"09:00","close":"17:00"}}') returning id`,
    [username, `TEST ${username}`, role, role !== "admin"],
  );
  made.push(row.id);
  await sql("insert into public.staff_services (staff_id, service_id) values ($1, $2)", [row.id, await serviceId("Hair Cut")]);
  await sql("insert into public.time_off (staff_id, starts_on, ends_on) values ($1, current_date + 40, current_date + 41)", [row.id]);
  return row.id;
}

async function del(user: "owner" | "admin" | "sam", id: string) {
  const client = await as(user);
  return client.rpc("delete_staff", { p_id: id });
}

describe("delete_staff()", () => {
  it("no bookings ever: the row is removed with its services and time off", async () => {
    const id = await tempStaff("test-nohistory");
    const { data, error } = await del("owner", id);
    expect(error).toBeNull();
    expect(data).toEqual([{ user_id: null, photo_path: "staff/old.webp", removed: true }]);
    expect(await sql("select 1 from public.staff where id = $1", [id])).toEqual([]);
    expect(await sql("select 1 from public.time_off where staff_id = $1", [id])).toEqual([]);
    const [audit] = await sql<{ action: string; summary: string }>(
      "select action, summary from public.audit_log where entity = 'staff' and entity_id = $1 order by id desc limit 1",
      [id],
    );
    expect(audit).toEqual({ action: "staff.delete", summary: "TEST test-nohistory" });
  });

  it("with history: a hidden row keeps only the name; the username is freed", async () => {
    const id = await tempStaff("test-history");
    await insertBooking({ staff: id, at: "2030-01-07 10:00", status: "completed" });
    // Bookings in the past don't block (2030 is "future", so make it past).
    await sql("update public.bookings set starts_at = now() - interval '30 days' where staff_id = $1", [id]);
    const { data, error } = await del("owner", id);
    expect(error).toBeNull();
    expect(data![0].removed).toBe(false);
    const [row] = await sql(
      "select display_name, username, user_id, active, bookable, show_on_site, title, photo_path, weekly_hours, deleted_at is not null as deleted from public.staff where id = $1",
      [id],
    );
    expect(row).toEqual({
      display_name: "TEST test-history", username: null, user_id: null, active: false, bookable: false, show_on_site: false,
      title: null, photo_path: null, weekly_hours: {}, deleted: true,
    });
    expect(await sql("select 1 from public.staff_services where staff_id = $1", [id])).toEqual([]);
    // The username can be used again.
    const again = await tempStaff("test-history");
    expect(again).not.toBe(id);
  });

  it("refused while they have upcoming bookings", async () => {
    const id = await tempStaff("test-upcoming");
    await insertBooking({ staff: id, at: "2030-01-07 10:00" });
    const { error } = await del("owner", id);
    expect(error?.message).toBe("has_upcoming");
    expect(await sql("select 1 from public.staff where id = $1 and deleted_at is null", [id])).toHaveLength(1);
  });

  it("owners delete barbers only; never yourself; barbers can't; admin can delete owners", async () => {
    const owner2 = await tempStaff("test-owner2", "owner");
    expect((await del("owner", owner2)).error?.code).toBe("42501");
    expect((await del("owner", STAFF.owner)).error?.message).toBe("cannot_delete_self");
    const barber = await tempStaff("test-barber");
    expect((await del("sam", barber)).error?.code).toBe("42501");
    expect((await del("admin", owner2)).error).toBeNull();
  });

  it("signed-out visitors can't call it", async () => {
    const id = await tempStaff("test-anon");
    expect((await anon().rpc("delete_staff", { p_id: id })).error?.code).toBe("42501");
  });
});

describe("end_user_sessions() and log_account_event()", () => {
  it("end_user_sessions is for the secret key only", async () => {
    const owner = await as("owner");
    expect((await owner.rpc("end_user_sessions", { p_user: "00000000-0000-4000-8000-000000000004" })).error?.code).toBe("42501");
    expect((await service().rpc("end_user_sessions", { p_user: "00000000-0000-4000-8000-0000000000ff" })).error).toBeNull();
  });

  it("password resets are logged under the person who asked, with the same limits as the team rules", async () => {
    const id = await tempStaff("test-reset");
    const owner = await as("owner");
    expect((await owner.rpc("log_account_event", { p_action: "account.password_reset", p_staff: id })).error).toBeNull();
    const [row] = await sql("select actor_name, action, summary from public.audit_log where entity = 'staff' and entity_id = $1", [id]);
    expect(row).toEqual({ actor_name: "Hewr", action: "account.password_reset", summary: "TEST test-reset" });

    expect((await owner.rpc("log_account_event", { p_action: "account.password_reset", p_staff: STAFF.admin })).error?.code).toBe("42501");
    expect((await owner.rpc("log_account_event", { p_action: "staff.delete", p_staff: id })).error?.code).toBe("42501");
    const sam = await as("sam");
    expect((await sam.rpc("log_account_event", { p_action: "account.password_reset", p_staff: id })).error?.code).toBe("42501");
  });
});
