import { afterEach, describe, expect, it } from "vitest";
import { as, CLIENTS, loose, service, sql } from "./helpers";

describe("two-step sign-in coverage", () => {
  it("every public table has a restrictive require_2fa policy", async () => {
    const { data, error } = await service().rpc("tables_missing_2fa_policy");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("every public table has RLS enabled", async () => {
    const rows = await sql<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(rows).toEqual([]);
  });

  it("the service role (server) can read every table and view", async () => {
    const s = service();
    for (const t of [
      "settings", "services", "staff", "staff_services", "time_off", "closures", "clients", "bookings", "gallery_photos",
      "reviews", "audit_log", "request_attempts", "login_failures", "push_subscriptions", "public_team", "client_stats",
    ] as const) {
      expect((await loose(s).from(t).select("*").limit(1)).error, t).toBeNull();
    }
  });

  it("two_factor_ok() is true for a signed-in account without a factor", async () => {
    const sam = await as("sam");
    expect((await sam.rpc("two_factor_ok")).data).toBe(true);
  });

  it("an account with a verified factor sees and changes nothing until the session is aal2", async () => {
    const sam = await as("sam");
    const userId = "00000000-0000-4000-8000-000000000003";
    await sql(
      `insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
       values (gen_random_uuid(), $1, 'test', 'totp', 'verified', now(), now(), 'TESTSECRET')`,
      [userId],
    );
    try {
      expect((await sam.rpc("two_factor_ok")).data).toBe(false);
      expect((await sam.from("bookings").select("id")).data).toEqual([]);
      expect((await sam.from("services").select("id")).data).toEqual([]);
      expect((await sam.from("staff").select("id")).data).toEqual([]);
      const update = await sam.from("bookings").update({ message_sent_at: new Date().toISOString() }).neq("status", "x").select();
      expect(update.data ?? []).toEqual([]);
    } finally {
      await sql("delete from auth.mfa_factors where user_id = $1 and friendly_name = 'test'", [userId]);
    }
    expect((await sam.from("bookings").select("id")).data!.length).toBeGreaterThan(0);
  });
});

describe("weekly hours validation", () => {
  const valid = (j: unknown) =>
    sql<{ ok: boolean }>("select app.valid_weekly_hours($1::jsonb) as ok", [JSON.stringify(j)]).then((r) => r[0].ok);

  it.each([
    [{}, true],
    [{ "1": { open: "09:00", close: "18:00" }, "7": null }, true],
    [{ "8": { open: "09:00", close: "18:00" } }, false],
    [{ "1": { open: "18:00", close: "09:00" } }, false],
    [{ "1": { open: "9:00", close: "18:00" } }, false],
    [{ "1": { open: "09:00", close: "24:00" } }, false],
    [{ "1": { open: "09:00" } }, false],
    [{ "1": { open: "09:00", close: "18:00", extra: 1 } }, false],
    [[], false],
  ])("%j -> %s", async (hours, expected) => {
    expect(await valid(hours)).toBe(expected);
  });

  it("is enforced on settings and staff", async () => {
    await expect(sql(`update public.settings set shop_hours = '{"1":{"open":"18:00","close":"09:00"}}'`)).rejects.toMatchObject({ code: "23514" });
  });
});

describe("app.fits_hours (DST-safe)", () => {
  const hours = { "7": { open: "09:00", close: "18:00" }, "1": { open: "09:00", close: "18:00" } };
  const fits = (start: string, end: string) =>
    sql<{ ok: boolean }>("select app.fits_hours($1::jsonb, $2::timestamptz, $3::timestamptz) as ok", [JSON.stringify(hours), start, end]).then(
      (r) => r[0].ok,
    );

  it("uses London wall-clock time on the day clocks go forward (Sun 29 Mar 2026)", async () => {
    expect(await fits("2026-03-29T08:00:00Z", "2026-03-29T08:30:00Z")).toBe(true); // 09:00 BST
    expect(await fits("2026-03-29T07:30:00Z", "2026-03-29T08:00:00Z")).toBe(false); // 08:30 BST
  });

  it("uses London wall-clock time on the day clocks go back (Sun 25 Oct 2026)", async () => {
    expect(await fits("2026-10-25T09:00:00Z", "2026-10-25T09:30:00Z")).toBe(true); // 09:00 GMT
    expect(await fits("2026-10-25T08:30:00Z", "2026-10-25T09:00:00Z")).toBe(false); // 08:30 GMT
  });

  it("refuses closed days and bookings that run past closing", async () => {
    expect(await fits("2026-10-27T10:00:00Z", "2026-10-27T10:30:00Z")).toBe(false); // Tuesday: closed
    expect(await fits("2026-10-26T17:45:00Z", "2026-10-26T18:15:00Z")).toBe(false);
    expect(await fits("2026-10-26T17:30:00Z", "2026-10-26T18:00:00Z")).toBe(true);
  });
});

describe("helpers", () => {
  it("formats pounds", async () => {
    const [r] = await sql<{ a: string; b: string; c: string }>("select app.pounds(1700) a, app.pounds(1750) b, app.pounds(5) c");
    expect(r).toEqual({ a: "£17", b: "£17.50", c: "£0.05" });
  });
});

describe("settings", () => {
  it("has exactly one row and refuses a second", async () => {
    await expect(sql("insert into public.settings (id) values (2)")).rejects.toMatchObject({ code: "23514" });
    expect(await sql("select id from public.settings")).toEqual([{ id: 1 }]);
  });

  it("owner can update it and the change is audited with column names", async () => {
    const owner = await as("owner");
    const before = (await sql<{ discount_text: string | null }>("select discount_text from public.settings"))[0].discount_text;
    try {
      expect((await owner.from("settings").update({ discount_text: "TEST 10% off Tuesdays" }).eq("id", 1)).error).toBeNull();
      const [row] = await sql<{ action: string; changed: string[] }>(
        "select action, changed from public.audit_log where entity = 'settings' order by id desc limit 1",
      );
      expect(row).toEqual({ action: "settings.update", changed: ["discount_text"] });
    } finally {
      await sql("update public.settings set discount_text = $1", [before]);
      await sql("delete from public.audit_log where entity = 'settings'");
    }
  });
});

describe("services", () => {
  it("can't be deleted once booked (FK restrict)", async () => {
    const [{ id }] = await sql<{ id: string }>("select service_id as id from public.bookings limit 1");
    await expect(sql("delete from public.services where id = $1", [id])).rejects.toMatchObject({ code: "23503" });
  });

  it("refuses durations that aren't 5-minute steps", async () => {
    await expect(sql("insert into public.services (name, price_pence, duration_min) values ('x', 100, 7)")).rejects.toMatchObject({ code: "23514" });
  });
});

describe("clients", () => {
  it("only accepts UK mobile numbers in E.164", async () => {
    await expect(sql("insert into public.clients (name, phone) values ('x', '+441513094681')")).rejects.toMatchObject({ code: "23514" });
    await expect(sql("insert into public.clients (name, phone) values ('x', '07700900123')")).rejects.toMatchObject({ code: "23514" });
  });

  it("client_stats derives visits, spend, usual service and barber", async () => {
    const owner = await as("owner");
    const { data } = await owner.from("client_stats").select("*").eq("client_id", CLIENTS.alex).single();
    expect(data).toMatchObject({ visits: 3, spent_pence: 5400, no_shows: 0, usual_service_name: "Skin Fade" });
    expect(data!.next_visit).not.toBeNull();
    const dan = await owner.from("client_stats").select("*").eq("client_id", CLIENTS.dan).single();
    expect(dan.data).toMatchObject({ visits: 0, no_shows: 1, last_visit: null });
  });
});

describe("gallery: slideshow max 3 visible, Recent cuts max 4", () => {
  afterEach(async () => {
    await sql("delete from public.gallery_photos where path like 'test/%'");
  });

  const add = (path: string, inHero: boolean, visible = true) =>
    sql("insert into public.gallery_photos (path, alt, in_hero, visible) values ($1, 'TEST', $2, $3)", [path, inHero, visible]);

  it("refuses a 5th visible Recent cut, but allows hidden ones", async () => {
    const existing = Number((await sql<{ n: string }>("select count(*) n from public.gallery_photos where visible and not in_hero"))[0].n);
    for (let i = existing; i < 4; i++) await add(`test/cut-${i}.webp`, false);
    await expect(add("test/cut-extra.webp", false)).rejects.toMatchObject({ message: "gallery_full" });
    await add("test/cut-hidden.webp", false, false);
    await expect(sql("update public.gallery_photos set visible = true where path = 'test/cut-hidden.webp'")).rejects.toMatchObject({
      message: "gallery_full",
    });
  });

  it("refuses a 4th visible slideshow photo", async () => {
    const existing = Number((await sql<{ n: string }>("select count(*) n from public.gallery_photos where visible and in_hero"))[0].n);
    for (let i = existing; i < 3; i++) await add(`test/hero-${i}.webp`, true);
    await expect(add("test/hero-extra.webp", true)).rejects.toMatchObject({ message: "gallery_full", hint: "slideshow" });
  });
});

describe("services.bookable_days", () => {
  it("OAP Cut is bookable Monday to Thursday only", async () => {
    const [row] = await sql<{ bookable_days: number[] }>("select bookable_days from public.services where name like 'OAP Cut%'");
    expect(row.bookable_days).toEqual([1, 2, 3, 4]);
  });

  it("accepts null or ISO weekdays only", async () => {
    await expect(sql("update public.services set bookable_days = '{}' where name = 'Hair Cut'")).rejects.toMatchObject({ code: "23514" });
    await expect(sql("update public.services set bookable_days = '{0,8}' where name = 'Hair Cut'")).rejects.toMatchObject({ code: "23514" });
  });

  it("anon can read it", async () => {
    const { data, error } = await service().from("services").select("name, bookable_days").eq("name", "Hair Cut").single();
    expect(error).toBeNull();
    expect(data!.bookable_days).toBeNull();
  });
});

describe("shop details", () => {
  it("has the opening hours from the shop's board", async () => {
    const [row] = await sql<{ shop_hours: Record<string, unknown>; walk_in_text: string }>("select shop_hours, walk_in_text from public.settings");
    expect(row.shop_hours["6"]).toEqual({ open: "08:30", close: "18:00" });
    expect(row.shop_hours["7"]).toEqual({ open: "09:00", close: "16:00" });
    expect(row.walk_in_text).toBe("Walk-ins welcome.");
  });
});

describe("storage buckets", () => {
  it("gallery and team are public WebP-only; restore-snapshots is private", async () => {
    const rows = await sql<{ id: string; public: boolean; allowed_mime_types: string[] | null }>(
      "select id, public, allowed_mime_types from storage.buckets order by id",
    );
    expect(rows).toEqual([
      { id: "gallery", public: true, allowed_mime_types: ["image/webp"] },
      { id: "restore-snapshots", public: false, allowed_mime_types: null },
      { id: "team", public: true, allowed_mime_types: ["image/webp"] },
    ]);
  });

  it("only managers can upload to the gallery", async () => {
    const webp = new Blob([new Uint8Array([0x52, 0x49, 0x46, 0x46])], { type: "image/webp" });
    const sam = await as("sam");
    expect((await sam.storage.from("gallery").upload("photos/test-sam.webp", webp)).error).not.toBeNull();
    const owner = await as("owner");
    const up = await owner.storage.from("gallery").upload("photos/test-owner.webp", webp, { upsert: true });
    expect(up.error).toBeNull();
    expect((await owner.storage.from("gallery").remove(["photos/test-owner.webp"])).error).toBeNull();
  });
});
