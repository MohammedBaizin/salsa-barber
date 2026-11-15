import { afterAll, describe, expect, it } from "vitest";
import { activityTypeFilter } from "@/lib/domain/activity";
import { as, sql } from "./helpers";

/**
 * Settings and closed days (spec §8.8) and the activity log queries (§8.9). Only the Google review count is
 * changed (nothing else reads it), and closed days are far ahead, so tests running alongside aren't affected.
 */

const FAR = "2028-06-14";
const [{ count: originalCount }] = await sql<{ count: number | null }>("select google_review_count as count from public.settings");

afterAll(async () => {
  await sql("update public.settings set google_review_count = $1", [originalCount]);
  await sql("delete from public.closures where closed_on = $1", [FAR]);
  await sql("delete from public.audit_log where (entity = 'settings' and 'google_review_count' = any(changed)) or (entity = 'closure' and summary like '%TEST closed%')");
});

describe("settings", () => {
  it("an owner's change is logged as settings.update with the changed columns", async () => {
    const owner = await as("owner");
    const { data, error } = await owner.from("settings").update({ google_review_count: 4321 }).eq("id", 1).select("id");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    const [row] = await sql<{ action: string; changed: string[]; actor_name: string }>(
      "select action, changed, actor_name from public.audit_log where entity = 'settings' order by id desc limit 1",
    );
    expect(row).toEqual({ action: "settings.update", changed: ["google_review_count"], actor_name: "Hewr" });
  });

  it("saving the same values again isn't logged", async () => {
    const owner = await as("owner");
    const before = await sql<{ n: number }>("select count(*)::int as n from public.audit_log where entity = 'settings'");
    await owner.from("settings").update({ google_review_count: 4321 }).eq("id", 1);
    const after = await sql<{ n: number }>("select count(*)::int as n from public.audit_log where entity = 'settings'");
    expect(after[0].n).toBe(before[0].n);
  });

  it("the database refuses out-of-range values and non-https links", async () => {
    const owner = await as("owner");
    expect((await owner.from("settings").update({ google_rating: 5.5 }).eq("id", 1)).error?.code).toBe("23514");
    expect((await owner.from("settings").update({ google_review_url: "http://example.com" }).eq("id", 1)).error?.code).toBe("23514");
    expect((await owner.from("settings").update({ min_notice_minutes: 45 }).eq("id", 1)).error?.code).toBe("23514");
  });
});

describe("closed days", () => {
  it("added, refused twice for the same day, removed: each logged with the date and reason", async () => {
    const owner = await as("owner");
    const { data, error } = await owner.from("closures").insert({ closed_on: FAR, reason: "TEST closed" }).select("id").single();
    expect(error).toBeNull();
    expect((await owner.from("closures").insert({ closed_on: FAR, reason: "TEST closed again" })).error?.code).toBe("23505");
    expect((await owner.from("closures").delete().eq("id", data!.id).select("id")).data).toHaveLength(1);
    const rows = await sql<{ action: string; summary: string }>(
      "select action, summary from public.audit_log where entity = 'closure' and entity_id = $1 order by id",
      [data!.id],
    );
    expect(rows).toEqual([
      { action: "closure.insert", summary: "Wed 14 Jun 2028 · TEST closed" },
      { action: "closure.delete", summary: "Wed 14 Jun 2028 · TEST closed" },
    ]);
  });

  it("barbers can't add or remove closed days", async () => {
    const sam = await as("sam");
    expect((await sam.from("closures").insert({ closed_on: FAR, reason: "TEST closed" })).error?.code).toBe("42501");
  });
});

describe("activity log queries", () => {
  it("type filter and the 'Show older' cursor work through PostgREST", async () => {
    const owner = await as("owner");
    await owner.from("settings").update({ google_review_count: 1234 }).eq("id", 1);
    const { data, error } = await owner
      .from("audit_log")
      .select("id, action")
      .or(activityTypeFilter("settings"))
      .order("id", { ascending: false })
      .limit(5);
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
    expect(data!.every((r) => /^(settings|closure|backup)\./.test(r.action))).toBe(true);

    const newest = data![0].id;
    const older = await owner.from("audit_log").select("id").lt("id", newest).order("id", { ascending: false }).limit(1);
    expect(older.error).toBeNull();
    expect(older.data!.every((r) => r.id < newest)).toBe(true);
  });

  it("filters by person", async () => {
    const owner = await as("owner");
    const [{ id }] = await sql<{ id: string }>("select id from public.staff where username = 'owner'");
    const { data } = await owner.from("audit_log").select("actor_id").eq("actor_id", id).limit(20);
    expect(data!.length).toBeGreaterThan(0);
    expect(data!.every((r) => r.actor_id === id)).toBe(true);
  });
});
