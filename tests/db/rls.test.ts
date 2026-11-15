import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anon, as, cleanupBookings, CLIENTS, insertBooking, loose, service, sql, STAFF } from "./helpers";

/** PostgREST answers "permission denied" (42501) when a role has no grant. */
const DENIED = "42501";

describe("anon (public website)", () => {
  const a = anon();

  it("reads active services, settings, closures, staff_services and visible reviews", async () => {
    const services = await a.from("services").select("id, name, active");
    expect(services.error).toBeNull();
    expect(services.data!.length).toBeGreaterThanOrEqual(13);
    expect(services.data!.every((s) => s.active)).toBe(true);

    const settings = await a.from("settings").select("*");
    expect(settings.error).toBeNull();
    expect(settings.data).toHaveLength(1);

    for (const table of ["closures", "staff_services", "reviews"] as const) {
      const r = await a.from(table).select("*");
      expect(r.error, table).toBeNull();
      expect(r.data!.length, table).toBeGreaterThan(0);
    }
  });

  it("does not see inactive services or hidden reviews", async () => {
    const s = service();
    const { data: svc } = await s.from("services").insert({ name: "TEST hidden service", price_pence: 100, duration_min: 5, active: false }).select().single();
    const { data: rev } = await s.from("reviews").insert({ author_name: "TEST", body: "hidden", stars: 5, visible: false }).select().single();
    try {
      expect((await a.from("services").select("id").eq("id", svc!.id)).data).toEqual([]);
      expect((await a.from("reviews").select("id").eq("id", rev!.id)).data).toEqual([]);
    } finally {
      await s.from("services").delete().eq("id", svc!.id);
      await s.from("reviews").delete().eq("id", rev!.id);
    }
  });

  it("sees the public team only: no admin, no switched-off, no usernames, roles or hours", async () => {
    const team = await a.from("public_team").select("*").order("sort");
    expect(team.error).toBeNull();
    expect(team.data!.map((t) => t.id)).toEqual([STAFF.owner, STAFF.sam, STAFF.jamie]);
    expect(Object.keys(team.data![0]).sort()).toEqual(
      ["bio", "bookable", "display_name", "id", "photo_path", "show_on_site", "sort", "title"].sort(),
    );

    for (const column of ["username", "role", "weekly_hours", "user_id", "active"]) {
      const r = await a.from("staff").select(column);
      expect(r.error?.code, column).toBe(DENIED);
    }
    const direct = await a.from("staff").select("id");
    expect(direct.data!.map((r) => r.id).sort()).toEqual([STAFF.owner, STAFF.sam, STAFF.jamie].sort());
  });

  it("cannot read private tables", async () => {
    for (const table of [
      "bookings", "clients", "audit_log", "time_off", "request_attempts", "login_failures", "push_subscriptions", "client_stats",
    ] as const) {
      const r = await loose(a).from(table).select("*").limit(1);
      expect(r.error?.code, table).toBe(DENIED);
    }
  });

  it("cannot write anything", async () => {
    expect((await a.from("services").insert({ name: "x", price_pence: 1, duration_min: 5 })).error?.code).toBe(DENIED);
    expect((await a.from("settings").update({ walk_in_text: "hacked" }).eq("id", 1)).error?.code).toBe(DENIED);
    expect((await a.from("reviews").insert({ author_name: "x", body: "x", stars: 5 })).error?.code).toBe(DENIED);
    expect((await a.from("closures").delete().neq("reason", "")).error?.code).toBe(DENIED);
    const settings = await sql<{ walk_in_text: string }>("select walk_in_text from public.settings");
    expect(settings[0].walk_in_text).not.toBe("hacked");
  });

  it("cannot call staff-only or service-only functions", async () => {
    expect((await a.rpc("two_factor_ok")).error).not.toBeNull();
    expect((await a.rpc("tables_missing_2fa_policy")).error).not.toBeNull();
  });
});

describe("barber (sam)", () => {
  let mine: { id: string };
  let theirs: { id: string };

  beforeAll(async () => {
    mine = await insertBooking({ staff: STAFF.sam, at: "2030-03-04 10:00", client: CLIENTS.chris });
    theirs = await insertBooking({ staff: STAFF.jamie, at: "2030-03-06 10:00", client: CLIENTS.dan });
  });
  afterAll(cleanupBookings);

  it("sees only their own bookings", async () => {
    const sam = await as("sam");
    const { data, error } = await sam.from("bookings").select("staff_id");
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
    expect(new Set(data!.map((b) => b.staff_id))).toEqual(new Set([STAFF.sam]));
  });

  it("sees only clients who have a booking with them", async () => {
    const sam = await as("sam");
    const { data } = await sam.from("clients").select("id");
    // Alex and Ben (seed) + Chris (test booking above); never Dan (only booked with Jamie)
    expect(data!.map((c) => c.id).sort()).toEqual([CLIENTS.alex, CLIENTS.ben, CLIENTS.chris].sort());
  });

  it("client_stats only counts their own visits", async () => {
    const sam = await as("sam");
    const { data } = await sam.from("client_stats").select("*").eq("client_id", CLIENTS.alex).single();
    expect(data!.visits).toBe(3);
    const ben = await sam.from("client_stats").select("*").eq("client_id", CLIENTS.ben).single();
    expect(ben.data!.visits).toBe(0);
  });

  it("can reschedule and change status on their own booking", async () => {
    const sam = await as("sam");
    const r = await sam
      .from("bookings")
      .update({ starts_at: "2030-03-04T11:00:00Z" })
      .eq("id", mine.id)
      .select("starts_at, ends_at")
      .single();
    expect(r.error).toBeNull();
    expect(new Date(r.data!.ends_at).getTime() - new Date(r.data!.starts_at).getTime()).toBe(30 * 60_000);
  });

  it("cannot change price, service or barber on their own booking", async () => {
    const sam = await as("sam");
    expect((await sam.from("bookings").update({ price_pence: 1 }).eq("id", mine.id)).error?.code).toBe(DENIED);
    expect((await sam.from("bookings").update({ staff_id: STAFF.jamie }).eq("id", mine.id)).error).not.toBeNull();
  });

  it("cannot touch another barber's booking", async () => {
    const sam = await as("sam");
    const r = await sam.from("bookings").update({ status: "cancelled" }).eq("id", theirs.id).select();
    expect(r.data).toEqual([]);
    expect((await sql("select status from public.bookings where id = $1", [theirs.id]))[0].status).toBe("confirmed");
  });

  it("cannot see the admin account or read the activity log", async () => {
    const sam = await as("sam");
    const staff = await sam.from("staff").select("id");
    expect(staff.data!.map((s) => s.id)).not.toContain(STAFF.admin);
    expect(staff.data!.map((s) => s.id)).toContain(STAFF.sam);
    expect((await sam.from("audit_log").select("id")).data).toEqual([]);
  });

  it("views their own time off but not others; cannot edit hours, services, settings or team", async () => {
    const sam = await as("sam");
    const off = await sam.from("time_off").select("staff_id");
    expect(off.data!.every((t) => t.staff_id === STAFF.sam)).toBe(true);
    expect((await sam.from("staff").update({ weekly_hours: {} }).eq("id", STAFF.sam).select()).data).toEqual([]);
    expect((await sam.from("services").update({ price_pence: 1 }).neq("price_pence", -1).select()).data).toEqual([]);
    expect((await sam.from("settings").update({ walk_in_text: "x" }).eq("id", 1).select()).data).toEqual([]);
    expect((await sam.from("staff").insert({ username: "newbie", display_name: "x", role: "barber" })).error).not.toBeNull();
    expect((await sam.from("time_off").insert({ staff_id: STAFF.sam, starts_on: "2030-01-01", ends_on: "2030-01-02" })).error).not.toBeNull();
  });
});

describe("owner", () => {
  afterAll(async () => {
    await sql("update public.staff set title = 'Barber' where id = $1", [STAFF.sam]);
    await sql("delete from public.audit_log where entity = 'staff'");
  });

  it("sees all bookings and clients, but not the admin account", async () => {
    const owner = await as("owner");
    const bookings = await owner.from("bookings").select("staff_id");
    expect(new Set(bookings.data!.map((b) => b.staff_id)).size).toBeGreaterThan(1);
    expect((await owner.from("clients").select("id")).data!.length).toBe(4);
    expect((await owner.from("staff").select("id")).data!.map((s) => s.id)).not.toContain(STAFF.admin);
  });

  it("edits a barber's profile (audited)", async () => {
    const owner = await as("owner");
    const r = await owner.from("staff").update({ title: "Senior barber" }).eq("id", STAFF.sam).select().single();
    expect(r.error).toBeNull();
    const audit = await sql<{ action: string; actor_name: string; changed: string[]; actor_is_admin: boolean }>(
      "select action, actor_name, changed, actor_is_admin from public.audit_log where entity = 'staff' and entity_id = $1 order by id desc limit 1",
      [STAFF.sam],
    );
    expect(audit[0]).toEqual({ action: "staff.update", actor_name: "Hewr", changed: ["title"], actor_is_admin: false });
  });

  it("cannot create owner/admin accounts, change roles, or edit the admin", async () => {
    const owner = await as("owner");
    expect((await owner.from("staff").insert({ username: "boss2", display_name: "x", role: "owner" })).error).not.toBeNull();
    expect((await owner.from("staff").update({ role: "owner" }).eq("id", STAFF.sam)).error).not.toBeNull();
    expect((await owner.from("staff").update({ title: "x" }).eq("id", STAFF.admin).select()).data).toEqual([]);
  });

  it("cannot switch themselves off or change their own role", async () => {
    const owner = await as("owner");
    expect((await owner.from("staff").update({ active: false }).eq("id", STAFF.owner)).error?.message).toContain("cannot_switch_off_self");
  });
});

describe("admin", () => {
  afterAll(async () => {
    await sql("update public.staff set role = 'barber' where id = $1", [STAFF.jamie]);
    await sql("delete from public.audit_log where entity = 'staff'");
  });

  it("sees the admin account; admin activity is hidden from the owner", async () => {
    const admin = await as("admin");
    expect((await admin.from("staff").select("id")).data!.map((s) => s.id)).toContain(STAFF.admin);

    expect((await admin.from("staff").update({ role: "owner" }).eq("id", STAFF.jamie)).error).toBeNull();
    const [row] = await sql<{ id: number; action: string; actor_is_admin: boolean; summary: string }>(
      "select id, action, actor_is_admin, summary from public.audit_log where entity_id = $1 order by id desc limit 1",
      [STAFF.jamie],
    );
    expect(row).toMatchObject({ action: "staff.role", actor_is_admin: true, summary: "SAMPLE Jamie · barber → owner" });

    const owner = await as("owner");
    expect((await owner.from("audit_log").select("id").eq("id", row.id)).data).toEqual([]);
    expect((await admin.from("audit_log").select("id").eq("id", row.id)).data).toHaveLength(1);
  });

  it("can never be made bookable or shown on the site", async () => {
    const admin = await as("admin");
    expect((await admin.from("staff").update({ bookable: true }).eq("id", STAFF.admin)).error).not.toBeNull();
  });
});
