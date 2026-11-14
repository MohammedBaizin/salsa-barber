import { afterAll, describe, expect, it } from "vitest";
import { anon, as, service, sql } from "./helpers";

/** push_subscriptions (spec §6, §10): server only (secret key), linked to the login, removed with it. */

const ENDPOINT = "https://fcm.googleapis.com/fcm/send/test-db-push";
afterAll(async () => {
  await sql("delete from public.push_subscriptions where endpoint like 'https://fcm.googleapis.com/fcm/send/test-db-%'");
});

describe("push subscriptions", () => {
  it("staff can't read or write them, even their own; only the server can", async () => {
    const [{ user_id }] = await sql<{ user_id: string }>("select user_id from public.staff where username = 'owner'");
    const row = { endpoint: ENDPOINT, user_id, p256dh: "x".repeat(87), auth: "y".repeat(22) };
    expect((await service().from("push_subscriptions").insert(row)).error).toBeNull();
    for (const client of [anon(), await as("owner"), await as("admin")]) {
      expect((await client.from("push_subscriptions").select("endpoint")).error?.code).toBe("42501");
      expect((await client.from("push_subscriptions").insert({ ...row, endpoint: `${ENDPOINT}-2` })).error?.code).toBe("42501");
    }
    expect((await service().from("push_subscriptions").select("endpoint").eq("endpoint", ENDPOINT)).data).toHaveLength(1);
  });

  it("are removed with the login", async () => {
    const [{ id }] = await sql<{ id: string }>(
      "insert into auth.users (id, email, aud, role) values (gen_random_uuid(), 'push-test@staff.salsabarber.invalid', 'authenticated', 'authenticated') returning id",
    );
    await sql("insert into public.push_subscriptions (endpoint, user_id, p256dh, auth) values ($1, $2, 'k', 'a')", [`${ENDPOINT}-gone`, id]);
    await sql("delete from auth.users where id = $1", [id]);
    expect(await sql("select 1 from public.push_subscriptions where endpoint = $1", [`${ENDPOINT}-gone`])).toEqual([]);
  });
});
