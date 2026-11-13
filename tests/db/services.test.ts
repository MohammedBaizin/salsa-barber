import { afterEach, describe, expect, it } from "vitest";
import { as, sql } from "./helpers";

const made: string[] = [];
afterEach(async () => {
  if (made.length) {
    await sql("delete from public.audit_log where entity = 'service' and entity_id = any($1::text[])", [made]);
    await sql("delete from public.services where id = any($1::uuid[])", [made]);
    made.length = 0;
  }
});

describe("services activity log", () => {
  it("reordering is logged as service.reorder, edits as service.update", async () => {
    const owner = await as("owner");
    const { data } = await owner.from("services").insert({ name: "TEST Reorder", price_pence: 500, duration_min: 15, sort: 999 }).select("id").single();
    made.push(data!.id);
    await owner.from("services").update({ sort: 998 }).eq("id", data!.id);
    await owner.from("services").update({ price_pence: 600 }).eq("id", data!.id);
    const rows = await sql<{ action: string }>("select action from public.audit_log where entity = 'service' and entity_id = $1 order by id", [data!.id]);
    expect(rows.map((r) => r.action)).toEqual(["service.create", "service.reorder", "service.update"]);
  });

  it("a service with bookings can't be deleted (switch it off instead)", async () => {
    const owner = await as("owner");
    const [{ id }] = await sql<{ id: string }>("select id from public.services where name = 'Hair Cut'");
    const { error } = await owner.from("services").delete().eq("id", id);
    expect(error?.code).toBe("23503");
  });

  it("barbers can't add, change or delete services", async () => {
    const sam = await as("sam");
    expect((await sam.from("services").insert({ name: "TEST No", price_pence: 1, duration_min: 5 })).error?.code).toBe("42501");
    const { data } = await sam.from("services").update({ price_pence: 1 }).eq("name", "Hair Cut").select("id");
    expect(data).toEqual([]);
  });
});
