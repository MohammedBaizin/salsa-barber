import { afterAll, describe, expect, it } from "vitest";
import { anon, as, service, sql, STAFF } from "./helpers";

/** Sign-in limits and account events (spec §9). Test hashes start with "test-"; their rows are removed afterwards. */

afterAll(async () => {
  await sql("delete from public.login_failures where visitor_hash like 'test-%' or user_hash like 'test-%'");
  await sql("delete from public.audit_log where action like 'account.%' and at > now() - interval '10 minutes'");
});

const svc = service();
const wait = async (visitor: string, user: string) => (await svc.rpc("login_wait_seconds", { p_visitor: visitor, p_user: user })).data ?? 0;
const fail = (visitor: string, user: string, times: number) =>
  Promise.all(Array.from({ length: times }, () => svc.rpc("record_login_failure", { p_visitor: visitor, p_user: user })));

describe("login limits", () => {
  it("visitor + username: the 5th failure in 15 minutes means waiting (about 15 minutes); success clears it", async () => {
    await fail("test-v1", "test-u1", 4);
    expect(await wait("test-v1", "test-u1")).toBe(0);
    await fail("test-v1", "test-u1", 1);
    const w = await wait("test-v1", "test-u1");
    expect(w).toBeGreaterThan(14 * 60);
    expect(w).toBeLessThanOrEqual(15 * 60);
    // Another visitor can still try that username; this visitor can still try another one.
    expect(await wait("test-v2", "test-u1")).toBe(0);
    expect(await wait("test-v1", "test-u9")).toBe(0);
    await svc.rpc("clear_login_failures", { p_visitor: "test-v1" });
    expect(await wait("test-v1", "test-u1")).toBe(0);
  });

  it("one visitor: 20 failures across usernames in 15 minutes", async () => {
    for (let i = 0; i < 19; i++) await fail("test-v3", `test-u3-${i}`, 1);
    expect(await wait("test-v3", "test-u3-new")).toBe(0);
    await fail("test-v3", "test-u3-last", 1);
    expect(await wait("test-v3", "test-u3-new")).toBeGreaterThan(0);
  });

  it("one username: 50 failures from anywhere in an hour; older failures don't count", async () => {
    for (let i = 0; i < 49; i++) await fail(`test-v4-${i}`, "test-u4", 1);
    expect(await wait("test-v4-new", "test-u4")).toBe(0);
    await fail("test-v4-last", "test-u4", 1);
    const w = await wait("test-v4-new", "test-u4");
    expect(w).toBeGreaterThan(59 * 60);
    await sql("update public.login_failures set at = now() - interval '61 minutes' where user_hash = 'test-u4'");
    expect(await wait("test-v4-new", "test-u4")).toBe(0);
  });

  it("only the server can use them", async () => {
    expect((await anon().rpc("login_wait_seconds", { p_visitor: "x", p_user: "y" })).error).not.toBeNull();
    expect((await (await as("admin")).rpc("record_login_failure", { p_visitor: "test-x", p_user: "test-y" })).error).not.toBeNull();
    expect((await (await as("owner")).rpc("clear_login_failures", { p_visitor: "test-x" })).error).not.toBeNull();
  });
});

describe("account events in the activity log", () => {
  it("anyone logs their own password change and two-step on/off, never someone else's", async () => {
    const sam = await as("sam");
    for (const action of ["account.password_change", "account.2fa_on", "account.2fa_off"]) {
      expect((await sam.rpc("log_account_event", { p_action: action, p_staff: STAFF.sam })).error).toBeNull();
      expect((await sam.rpc("log_account_event", { p_action: action, p_staff: STAFF.jamie })).error?.code).toBe("42501");
    }
    const rows = await sql<{ action: string; actor_name: string }>(
      "select action, actor_name from public.audit_log where entity_id = $1 and action like 'account.%' and at > now() - interval '1 minute' order by id",
      [STAFF.sam],
    );
    expect(rows.map((r) => r.action)).toEqual(["account.password_change", "account.2fa_on", "account.2fa_off"]);
  });

  it("two-step reset: admin only, never for themselves; unknown actions refused", async () => {
    expect((await (await as("owner")).rpc("log_account_event", { p_action: "account.2fa_reset", p_staff: STAFF.sam })).error?.code).toBe("42501");
    const admin = await as("admin");
    expect((await admin.rpc("log_account_event", { p_action: "account.2fa_reset", p_staff: STAFF.sam })).error).toBeNull();
    expect((await admin.rpc("log_account_event", { p_action: "account.2fa_reset", p_staff: STAFF.admin })).error?.code).toBe("42501");
    expect((await admin.rpc("log_account_event", { p_action: "booking.accept", p_staff: STAFF.sam })).error?.code).toBe("42501");
  });
});
