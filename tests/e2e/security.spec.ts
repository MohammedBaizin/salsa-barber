import { readFileSync } from "node:fs";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { totp } from "../../src/lib/auth/totp";
import { signInAs } from "./dashboard-helpers";
import { expectAccessible, expectNoHorizontalScroll, formAlert, resetSampleLogin, SAMPLE_PASSWORD, setTheme, signIn, sql } from "./helpers";

/** Sign-in security (spec §9). Sample logins are put back after each test; sign-in failures are cleared. */
test.afterEach(async () => {
  await sql("delete from public.login_failures");
  for (const u of ["sam", "jamie"]) await resetSampleLogin(u);
  await sql("delete from public.audit_log where action like 'account.%' and at > now() - interval '10 minutes'");
  await sql("delete from public.services where name like 'E2E Direct%'");
});

const toast = (page: Page) => page.getByTestId("toast");

/** A code that hasn't been used yet (waits for the next 30-second window if needed). */
const used = new Set<string>();
async function freshCode(secret: string): Promise<string> {
  for (;;) {
    const code = totp(secret);
    if (!used.has(`${secret}:${code}`)) {
      used.add(`${secret}:${code}`);
      return code;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

async function turnOnTwoStep(page: Page): Promise<string> {
  await page.goto("/dashboard/account");
  const card = page.getByRole("region", { name: "Two-step sign-in" });
  await card.getByRole("button", { name: "Set up two-step sign-in" }).click();
  const secret = (await card.getByTestId("totp-secret").textContent())!.trim();
  await expect(card.getByRole("img", { name: "QR code for your authenticator app" })).toBeVisible();
  await card.getByLabel("6-digit code from the app").fill("000000" === totp(secret) ? "111111" : "000000");
  await card.getByRole("button", { name: "Turn on" }).click();
  await expect(card.getByText(/That code didn't work/)).toBeVisible();
  await card.getByLabel("6-digit code from the app").fill(await freshCode(secret));
  await card.getByRole("button", { name: "Turn on" }).click();
  await expect(toast(page)).toHaveText("Two-step sign-in is on.");
  await expect(page.getByTestId("two-step-status")).toHaveText("On for your account");
  return secret;
}

test.describe("sign-in security", () => {
  test("five wrong passwords lock that username for this visitor, even with the right one; unknown usernames too", async ({ page }) => {
    await page.goto("/login");
    const failures = async () => (await sql("select count(*)::int as n from public.login_failures"))[0].n as number;
    // Each answer looks the same, so wait for each failure to be recorded before trying again.
    for (let i = 1; i <= 5; i++) {
      await signIn(page, "sam", "wrong-password");
      await expect.poll(failures).toBe(i);
      await expect(formAlert(page)).toHaveText("Wrong username or password.");
    }
    await signIn(page, "sam", SAMPLE_PASSWORD);
    await expect(formAlert(page)).toHaveText(/^Too many attempts\. Try again in 1[45] minutes\.$/);
    await expect(page.getByLabel("Username")).toHaveValue("sam");

    for (let i = 6; i <= 10; i++) {
      await signIn(page, "nobody-here", "whatever");
      await expect.poll(failures).toBe(i);
    }
    await signIn(page, "nobody-here", "whatever");
    await expect(formAlert(page)).toHaveText(/^Too many attempts/);
    // Stored as keyed hashes only.
    const rows = await sql("select visitor_hash, user_hash from public.login_failures");
    expect(JSON.stringify(rows)).not.toMatch(/sam|nobody|127\.0\.0\.1/);
  });

  test("change password: live checklist, current password checked, then the new one works", async ({ page }) => {
    await signInAs(page, "sam");
    await page.goto("/dashboard/account");
    const card = page.getByRole("region", { name: "Password" });
    const rules = card.getByRole("list", { name: "Password rules" });
    await card.getByLabel("New password", { exact: true }).fill("sam-password");
    await expect(rules.getByRole("listitem").filter({ hasText: "username" })).toContainText("(not yet)");
    await card.getByLabel("New password", { exact: true }).fill("Copper-Kettle-42");
    await expect(rules.getByRole("listitem").filter({ hasText: "(not yet)" })).toHaveCount(0);
    await card.getByLabel("New password again").fill("Copper-Kettle-42");
    await card.getByLabel("Current password").fill("not-my-password");
    await card.getByRole("button", { name: "Change password" }).click();
    await expect(card.getByText("That isn't your current password.")).toBeVisible();

    await card.getByLabel("Current password").fill(SAMPLE_PASSWORD);
    await card.getByRole("button", { name: "Change password" }).click();
    await expect(toast(page)).toHaveText("Password changed.");
    const [log] = await sql("select action from public.audit_log where action = 'account.password_change' order by id desc limit 1");
    expect(log.action).toBe("account.password_change");

    await page.context().clearCookies();
    await page.goto("/login");
    await signIn(page, "sam", SAMPLE_PASSWORD);
    await expect(formAlert(page)).toHaveText("Wrong username or password.");
    await signIn(page, "sam", "Copper-Kettle-42");
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("two-step sign-in: turn on, then sign-in needs a code (wrong codes refused); turn off needs a code", async ({ page }) => {
    test.setTimeout(150_000);
    await signInAs(page, "jamie");
    const secret = await turnOnTwoStep(page);

    await page.context().clearCookies();
    await page.goto("/login?next=/dashboard/calendar");
    await signIn(page, "jamie", SAMPLE_PASSWORD);
    await expect(page).toHaveURL(/\/login\/2fa\?next=%2Fdashboard%2Fcalendar$/);
    // Without the code, the dashboard sends you back here and the data stays locked.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\/2fa/);
    await page.getByLabel("6-digit code").fill("12345");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(formAlert(page)).toHaveText("Enter the 6-digit code from your authenticator app.");
    await page.getByLabel("6-digit code").fill(totp(secret) === "000000" ? "111111" : "000000");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(formAlert(page)).toHaveText(/That code didn't work/);
    await page.getByLabel("6-digit code").fill(await freshCode(secret));
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto("/dashboard/account");
    const card = page.getByRole("region", { name: "Two-step sign-in" });
    await card.getByRole("button", { name: "Turn off two-step sign-in" }).click();
    await card.getByLabel("6-digit code from the app").fill(await freshCode(secret));
    await card.getByRole("button", { name: "Turn off" }).click();
    await expect(toast(page)).toHaveText("Two-step sign-in is off.");
    await expect(page.getByTestId("two-step-status")).toHaveText("Off");
    const logged = await sql("select action from public.audit_log where action like 'account.2fa_%' order by id");
    expect(logged.map((r) => r.action)).toEqual(["account.2fa_on", "account.2fa_off"]);
  });

  test("admin resets someone's two-step sign-in: they're signed out and can sign in with just their password", async ({ page, browser }) => {
    test.setTimeout(120_000);
    await signInAs(page, "jamie");
    await turnOnTwoStep(page);

    const adminPage = await (await browser.newContext()).newPage();
    await signInAs(adminPage, "admin");
    const [{ id }] = await sql("select id from public.staff where username = 'jamie'");
    await adminPage.goto(`/dashboard/team/${id}?tab=account`);
    await expect(adminPage.getByTestId("member-two-step")).toContainText("On");
    await adminPage.getByRole("button", { name: "Reset two-step sign-in" }).click();
    await adminPage.getByRole("button", { name: "Reset two-step sign-in" }).click();
    await expect(adminPage.getByTestId("toast")).toHaveText("Two-step sign-in reset for SAMPLE Jamie.");
    await expect(adminPage.getByTestId("member-two-step")).toHaveText("Off.");
    await adminPage.context().close();

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
    await signIn(page, "jamie", SAMPLE_PASSWORD);
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("dashboard theme: Light, Dark or System, kept on this device", async ({ page }) => {
    await signInAs(page, "sam");
    await page.goto("/dashboard/account");
    const card = page.getByRole("region", { name: "Dashboard theme" });
    await card.getByText("Dark", { exact: true }).click();
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    await expect(card.getByRole("radio", { name: "Dark" })).toBeChecked();
    await card.getByText("Light", { exact: true }).click();
    await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
    await page.emulateMedia({ colorScheme: "dark" });
    await card.getByText("System", { exact: true }).click();
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  });

  for (const theme of ["light", "dark"] as const) {
    test(`WCAG 2.1 AA and no sideways scroll: Account and two-step page (${theme})`, async ({ page }) => {
      test.setTimeout(90_000);
      await setTheme(page, "dashboard", theme);
      await signInAs(page, "jamie");
      await page.goto("/dashboard/account");
      if (page.viewportSize()!.width < 1024) await page.setViewportSize({ width: 320, height: 760 });
      await page.getByRole("region", { name: "Two-step sign-in" }).getByRole("button", { name: "Set up two-step sign-in" }).click();
      await expect(page.getByTestId("totp-secret")).toBeVisible();
      await expectNoHorizontalScroll(page);
      await expectAccessible(page);
    });
  }
});

// ---------------------------------------------------------------------------
// Direct calls: server actions called by id (from the build's manifest), skipping the UI.
// ---------------------------------------------------------------------------

const manifest = JSON.parse(readFileSync(".next/server/server-reference-manifest.json", "utf8")) as {
  node: Record<string, { filename: string; exportedName: string }>;
};
type Action = { id: string; path: string };
/** The action's id and a page that includes it (Next only runs an action from a page that uses it). */
function actionId(file: string, name: string): Action {
  const hit = Object.entries(manifest.node).find(([, e]) => e.filename.endsWith(file) && e.exportedName === name);
  if (!hit) throw new Error(`No server action ${name} in ${file}`);
  const workers = Object.keys((hit[1] as unknown as { workers: Record<string, unknown> }).workers);
  const page = workers.find((w) => w.endsWith("/page") && !w.includes("[")) ?? workers.find((w) => w.endsWith("/page"));
  if (!page) throw new Error(`No page uses ${name}`);
  const path =
    page
      .replace(/^app/, "")
      .replace(/\/\([^)]+\)/g, "")
      .replace(/\/page$/, "")
      .replace(/\[\.\.\.[^\]]+\]/g, "x")
      .replace(/\[[^\]]+\]/g, "00000000-0000-4000-8000-000000000000") || "/";
  return { id: hit[0], path };
}

/** Calls (prevState, formData) actions the way React does (multipart: "_1_<field>" = the form, then "0" = the arguments). */
async function callFormAction(request: APIRequestContext, action: Action, prev: unknown, fields: Record<string, string>) {
  // The form's fields first and the arguments ("0") last, as React sends them: the server reads them as a stream.
  // (A FormData keeps that order; a plain object would put the key "0" first.)
  const multipart = new FormData();
  for (const [k, v] of Object.entries(fields)) multipart.append(`_1_${k}`, v);
  multipart.append("0", JSON.stringify([prev, "$K1"]));
  return request.post(action.path, { headers: { "Next-Action": action.id, Accept: "text/x-component" }, multipart, maxRedirects: 0 });
}
async function callJsonAction(request: APIRequestContext, action: Action, args: unknown[]) {
  return request.post(action.path, {
    headers: { "Next-Action": action.id, Accept: "text/x-component", "Content-Type": "text/plain;charset=UTF-8" },
    data: JSON.stringify(args),
    maxRedirects: 0,
  });
}

const saveState = { error: null, fields: {}, warning: null, done: null, attempt: 0 };
const RULES = { minNoticeMinutes: "120", bookingWindowDays: "77", dueBackWeeks: "5", maxOpenRequests: "3", changeCutoffMinutes: "120" };

test.describe("direct server action calls", () => {
  let windowDays = 30;
  test.beforeEach(async () => {
    [{ booking_window_days: windowDays }] = await sql("select booking_window_days from public.settings");
  });
  test.afterEach(async () => {
    await sql("update public.settings set booking_window_days = $1", [windowDays]);
    await sql("delete from public.audit_log where entity = 'settings' and at > now() - interval '5 minutes'");
  });

  test("control: the owner's call works (so the refusals below are real)", async ({ page }) => {
    await signInAs(page, "owner");
    const res = await callFormAction(page.request, actionId("settings/actions.ts", "saveBookingRules"), saveState, RULES);
    expect(res.status()).toBe(200);
    const [s] = await sql("select booking_window_days from public.settings");
    expect(s.booking_window_days).toBe(77);
  });

  test("a barber calling owner-only actions changes nothing", async ({ page }) => {
    await signInAs(page, "sam");
    const order = async () => (await sql("select id from public.services order by sort, name")).map((r) => r.id);
    const before = await order();
    const clients = await sql("select count(*)::int as n from public.clients");
    const [owner] = await sql("select id from public.staff where username = 'owner'");
    const [client] = await sql("select id from public.clients order by created_at limit 1");

    await callFormAction(page.request, actionId("settings/actions.ts", "saveBookingRules"), saveState, RULES);
    await callFormAction(page.request, actionId("services/actions.ts", "saveService"), { error: null, fields: {}, done: null, attempt: 0 }, {
      name: "E2E Direct", price: "1", durationMin: "30", days: "1",
    });
    await callJsonAction(page.request, actionId("services/actions.ts", "reorderServices"), [[...before].reverse()]);
    await callFormAction(page.request, actionId("clients/actions.ts", "deleteClient"), { error: null, fields: {} }, { id: client.id });
    await callFormAction(page.request, actionId("team/actions.ts", "resetPassword"), saveState, { id: owner.id });
    await callFormAction(page.request, actionId("team/actions.ts", "resetTwoStep"), saveState, { id: owner.id });

    expect((await sql("select booking_window_days from public.settings"))[0].booking_window_days).toBe(windowDays);
    expect(await sql("select 1 from public.services where name like 'E2E Direct%'")).toEqual([]);
    expect(await order()).toEqual(before);
    expect((await sql("select count(*)::int as n from public.clients"))[0].n).toBe(clients[0].n);
    expect(await sql("select 1 from public.audit_log where action in ('account.password_reset', 'account.2fa_reset') and at > now() - interval '1 minute'")).toEqual([]);
    // The owner can still sign in with the sample password.
    const fresh = await (await page.context().browser()!.newContext()).newPage();
    await signInAs(fresh, "owner");
    await fresh.context().close();
  });

  test("signed out: calls are refused", async ({ request }) => {
    await callFormAction(request, actionId("settings/actions.ts", "saveBookingRules"), saveState, RULES);
    await callFormAction(request, actionId("services/actions.ts", "saveService"), { error: null, fields: {}, done: null, attempt: 0 }, {
      name: "E2E Direct anon", price: "1", durationMin: "30", days: "1",
    });
    expect((await sql("select booking_window_days from public.settings"))[0].booking_window_days).toBe(windowDays);
    expect(await sql("select 1 from public.services where name like 'E2E Direct%'")).toEqual([]);
  });
});
