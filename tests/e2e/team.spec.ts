import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { londonDay, signInAs } from "./dashboard-helpers";
import { expectAccessible, expectNoHorizontalScroll, formAlert, setTheme, signIn, sql } from "./helpers";

/** Test accounts: usernames e2e-*, names "E2E …". Only those are removed. */
async function cleanup() {
  const ids = "select id from public.staff where username like 'e2e-%' or (deleted_at is not null and display_name like 'E2E %')";
  await sql(`delete from public.audit_log where entity = 'staff' and entity_id in (select id::text from (${ids}) x)`);
  await sql(`delete from public.bookings where staff_id in (${ids})`);
  const users = await sql("select user_id from public.staff where username like 'e2e-%' and user_id is not null");
  await sql(`delete from public.staff where id in (${ids})`);
  await sql("delete from auth.users where email like 'e2e-%@staff.salsabarber.invalid'");
  if (users.length) await sql("delete from auth.users where id = any($1::uuid[])", [users.map((u) => u.user_id)]);
}
test.beforeEach(cleanup);
test.afterEach(cleanup);

/** A barber without a login (profile tabs don't need one). */
async function tempBarber(name = "E2E Temp Barber", username = "e2e-temp"): Promise<string> {
  const [row] = await sql(
    `insert into public.staff (username, display_name, role, bookable, title, weekly_hours)
     values ($1, $2, 'barber', true, 'Barber', '{"1":{"open":"09:00","close":"17:00"}}') returning id`,
    [username, name],
  );
  await sql("insert into public.staff_services (staff_id, service_id) select $1, id from public.services where name in ('Hair Cut', 'Skin Fade')", [row.id]);
  return row.id;
}

async function bookingFor(staffId: string, days: number) {
  await sql(
    `insert into public.bookings (client_id, staff_id, service_id, service_name, price_pence, duration_min, starts_at, ends_at, status, source)
     select null, $1, id, name, price_pence, 30, t, t, 'confirmed', 'walk_in'
     from public.services, lateral (select (((now() at time zone 'Europe/London')::date + $2::int) + time '07:00') at time zone 'Europe/London' as t) x
     where name = 'Hair Cut'`,
    [staffId, days],
  );
}

/** Navigate and, on pages with forms, wait until they're interactive (hydrated) so typing isn't lost. */
async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  if (path.includes("/team/")) await expect(page.locator("form[data-ready]").first()).toBeVisible();
}

const tab = (page: Page, name: string) => page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name });

test.describe("team", () => {
  test("owner adds a barber: one-time password, hidden and not bookable, shop hours and every service; they can sign in", async ({ page, browser }) => {
    await signInAs(page, "owner");
    await open(page, "/dashboard/team");
    await page.getByRole("button", { name: "Add barber" }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByLabel("Name", { exact: true }).fill("E2E New Barber");
    await sheet.getByLabel("Username").fill("E2E-New");
    await sheet.getByRole("button", { name: "Create account" }).click();
    const password = (await sheet.getByTestId("temp-password-value").textContent())!.trim();
    expect(password).toMatch(/^[a-km-zA-HJ-NP-RT-Y346-9]{12}$/);
    await expect(sheet).toContainText("Username: e2e-new");

    const [row] = await sql(
      `select s.role, s.bookable, s.show_on_site, s.weekly_hours = (select shop_hours from public.settings) as shop_hours,
         (select count(*)::int from public.staff_services ss where ss.staff_id = s.id) as services,
         (select count(*)::int from public.services where active) as all_services, s.user_id is not null as has_login
       from public.staff s where s.username = 'e2e-new'`,
    );
    expect(row).toMatchObject({ role: "barber", bookable: false, show_on_site: false, shop_hours: true, has_login: true });
    expect(row.services).toBe(row.all_services);
    const [audit] = await sql("select action, actor_name from public.audit_log where action = 'staff.create' and summary = 'E2E New Barber'");
    expect(audit).toEqual({ action: "staff.create", actor_name: "Hewr" });

    // Duplicate username.
    await open(page, "/dashboard/team");
    await page.getByRole("button", { name: "Add barber" }).click();
    await page.getByRole("dialog").getByLabel("Name", { exact: true }).fill("E2E Again");
    await page.getByRole("dialog").getByLabel("Username").fill("e2e-new");
    await page.getByRole("dialog").getByRole("button", { name: "Create account" }).click();
    await expect(formAlert(page)).toHaveText("That username is already taken.");

    // They can sign in with the one-time password.
    const other = await browser.newPage();
    await other.goto("/login");
    await signIn(other, "e2e-new", password);
    await expect(other.getByTestId("signed-in-as")).toHaveText("E2E New Barber · Barber");
    await other.close();
  });

  test("profile: shown on the website and taking bookings (the homepage updates)", async ({ page }) => {
    const id = await tempBarber("E2E Website Barber");
    await sql("update public.staff set bookable = false where id = $1", [id]);
    await signInAs(page, "owner");
    await open(page, `/dashboard/team/${id}`);
    await page.getByLabel("Title", { exact: true }).fill("Senior barber");
    await page.getByLabel("Takes bookings").check();
    await page.getByLabel("Show on the website").check();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByTestId("toast")).toHaveText("Profile saved.");
    const [row] = await sql("select title, bookable, show_on_site from public.staff where id = $1", [id]);
    expect(row).toEqual({ title: "Senior barber", bookable: true, show_on_site: true });
    await page.goto("/");
    await expect(page.locator("#team")).toContainText("E2E Website Barber");
  });

  test("photo: upload (re-encoded to WebP) and remove", async ({ page }) => {
    const id = await tempBarber();
    const png = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#c33" } }).png().toBuffer();
    await signInAs(page, "owner");
    await open(page, `/dashboard/team/${id}?tab=photo`);
    await page.getByLabel("Choose a photo").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: png });
    await page.getByRole("button", { name: "Save photo" }).click();
    await expect(page.getByTestId("toast")).toHaveText("Photo saved.");
    const [{ photo_path }] = await sql("select photo_path from public.staff where id = $1", [id]);
    expect(photo_path).toMatch(new RegExp(`^staff/${id}/[0-9a-f-]{36}\\.webp$`));
    await expect(page.getByTestId("team-photo")).toHaveAttribute("src", new RegExp(`/storage/v1/object/public/team/staff/${id}/`));
    const res = await page.request.get((await page.getByTestId("team-photo").getAttribute("src"))!);
    expect(res.headers()["content-type"]).toBe("image/webp");

    await page.getByRole("button", { name: "Remove photo" }).click();
    await expect(page.getByTestId("toast")).toHaveText("Photo removed.");
    expect((await sql("select photo_path from public.staff where id = $1", [id]))[0].photo_path).toBeNull();
    expect((await page.request.get(res.url())).status()).toBeGreaterThanOrEqual(400);
  });

  test("services and working hours (finish must be after start)", async ({ page }) => {
    const id = await tempBarber();
    await signInAs(page, "owner");
    await open(page, `/dashboard/team/${id}?tab=services`);
    await page.getByLabel("Skin Fade", { exact: true }).uncheck();
    await page.getByLabel("Beard Trim & Shape Up").check();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByTestId("toast")).toHaveText("Services saved.");
    const services = await sql(
      "select v.name from public.staff_services ss join public.services v on v.id = ss.service_id where ss.staff_id = $1 order by v.name",
      [id],
    );
    expect(services.map((s) => s.name)).toEqual(["Beard Trim & Shape Up", "Hair Cut"]);

    await tab(page, "Schedule").click();
    const tuesday = page.getByTestId("hours-2");
    await tuesday.getByLabel("Tuesday").check();
    await tuesday.getByLabel("Tuesday start").selectOption("600");
    await tuesday.getByLabel("Tuesday finish").selectOption("540");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(tuesday.getByRole("alert")).toHaveText("Tuesday: Finish time must be after the start time.");
    await tuesday.getByLabel("Tuesday finish").selectOption("1080");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByTestId("toast")).toHaveText("Working hours saved.");
    const [{ weekly_hours }] = await sql("select weekly_hours from public.staff where id = $1", [id]);
    expect(weekly_hours).toMatchObject({ "1": { open: "09:00", close: "17:00" }, "2": { open: "10:00", close: "18:00" }, "3": null });
  });

  test("time off warns about bookings inside the dates, then 'Add anyway'; remove", async ({ page }) => {
    const id = await tempBarber();
    await bookingFor(id, 3);
    const from = await londonDay(2);
    const to = await londonDay(4);
    await signInAs(page, "owner");
    await open(page, `/dashboard/team/${id}?tab=schedule`);
    await page.getByLabel("First day").fill(from);
    await page.getByLabel("Last day").fill(to);
    await page.getByLabel("Reason (optional, staff only)").fill("Holiday");
    await page.getByRole("button", { name: "Add time off" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "1 booking falls inside these dates" })).toBeVisible();
    await page.getByRole("button", { name: "Add anyway" }).click();
    await expect(page.getByTestId("toast")).toHaveText("Time off added.");
    await expect(page.getByTestId("time-off-list")).toContainText("Holiday");
    expect(await sql("select starts_on::text, ends_on::text from public.time_off where staff_id = $1", [id])).toEqual([{ starts_on: from, ends_on: to }]);

    await page.getByTestId("time-off-list").getByRole("button", { name: /^Remove/ }).click();
    await expect(page.getByTestId("toast")).toHaveText("Time off removed.");
    expect(await sql("select 1 from public.time_off where staff_id = $1", [id])).toEqual([]);
  });

  test("account: reset password (old one stops working), switch off with a warning, delete blocked then allowed", async ({ page, browser }) => {
    // A real login, made through the UI.
    await signInAs(page, "owner");
    await open(page, "/dashboard/team");
    await page.getByRole("button", { name: "Add barber" }).click();
    await page.getByRole("dialog").getByLabel("Name", { exact: true }).fill("E2E Account Barber");
    await page.getByRole("dialog").getByLabel("Username").fill("e2e-acct");
    await page.getByRole("dialog").getByRole("button", { name: "Create account" }).click();
    const first = (await page.getByTestId("temp-password-value").textContent())!.trim();
    await page.getByRole("link", { name: "Open their profile" }).click();
    await tab(page, "Account").click();

    await page.getByRole("button", { name: "Reset password" }).click();
    await expect(page.getByRole("button", { name: "Keep" })).toBeFocused();
    await page.getByRole("group").getByRole("button", { name: "Reset password" }).click();
    const second = (await page.getByTestId("temp-password-value").textContent())!.trim();
    expect(second).not.toBe(first);
    const [audit] = await sql("select actor_name from public.audit_log where action = 'account.password_reset' and summary = 'E2E Account Barber'");
    expect(audit.actor_name).toBe("Hewr");
    const other = await browser.newPage();
    await other.goto("/login");
    await signIn(other, "e2e-acct", first);
    await expect(formAlert(other)).toHaveText("Wrong username or password.");
    await signIn(other, "e2e-acct", second);
    await expect(other.getByTestId("signed-in-as")).toBeVisible();

    // Switch off: warned about their upcoming booking; they're signed out.
    const [{ id }] = await sql("select id from public.staff where username = 'e2e-acct'");
    await bookingFor(id, 2);
    await page.reload();
    await page.getByRole("button", { name: "Switch off" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "has 1 upcoming booking" })).toBeVisible();
    await page.getByRole("button", { name: "Switch off anyway" }).click();
    await expect(page.getByTestId("toast")).toHaveText("E2E Account Barber switched off.");
    await other.reload();
    await expect(other).toHaveURL(/\/login/);
    await other.close();
    await page.getByRole("button", { name: "Switch back on" }).click();
    await expect(page.getByTestId("toast")).toHaveText("E2E Account Barber switched back on.");

    // Delete: blocked while the booking is upcoming.
    await expect(page.getByTestId("delete-blocked")).toContainText("has 1 upcoming booking");
    await sql("delete from public.bookings where staff_id = $1", [id]);
    await page.reload();
    await page.getByRole("button", { name: "Delete account" }).click();
    await page.getByRole("group").getByRole("button", { name: "Delete account" }).click();
    await expect(page).toHaveURL(/\/dashboard\/team\?deleted=1$/);
    expect(await sql("select 1 from public.staff where id = $1", [id])).toEqual([]);
    expect(await sql("select 1 from auth.users where email = 'e2e-acct@staff.salsabarber.invalid'")).toEqual([]);
  });

  test("owners never see the admin account; admins can add any role and change roles", async ({ page }) => {
    await signInAs(page, "owner");
    await open(page, "/dashboard/team");
    await expect(page.getByTestId("team-list")).not.toContainText("SAMPLE Admin");
    await page.goto("/dashboard/team/10000000-0000-4000-8000-000000000001");
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    // Owners can't change roles.
    await page.goto("/dashboard/team/10000000-0000-4000-8000-000000000003?tab=account");
    await expect(page.getByLabel("Role")).toHaveCount(0);

    const id = await tempBarber();
    await page.getByRole("button", { name: "Sign out" }).click();
    await signInAs(page, "admin");
    await open(page, "/dashboard/team");
    await expect(page.getByTestId("team-list")).toContainText("SAMPLE Admin");
    await page.getByRole("button", { name: "Add person" }).click();
    await expect(page.getByRole("dialog").getByLabel("Role").locator("option")).toHaveText(["Barber", "Owner", "Admin"]);
    await page.keyboard.press("Escape");
    await open(page, `/dashboard/team/${id}?tab=account`);
    await page.getByLabel("Role").selectOption("owner");
    await page.getByRole("button", { name: "Change role" }).click();
    await expect(page.getByTestId("toast")).toHaveText("Role changed.");
    expect((await sql("select role from public.staff where id = $1", [id]))[0].role).toBe("owner");
  });

  test("barbers see their own hours and time off on Me (read-only)", async ({ page }) => {
    await signInAs(page, "sam");
    await page.getByRole("navigation", { name: "Dashboard" }).getByRole("link", { name: "Me" }).click();
    await expect(page.getByTestId("my-hours")).toContainText("10:00am–6:00pm");
    await expect(page.getByTestId("my-time-off")).toContainText("SAMPLE holiday");
    await expect(page.getByRole("button", { name: /save/i })).toHaveCount(0);
  });

  for (const theme of ["light", "dark"] as const) {
    test(`WCAG 2.1 AA and no sideways scroll (${theme})`, async ({ page }) => {
      const id = await tempBarber();
      await setTheme(page, "dashboard", theme);
      await signInAs(page, "owner");
      if (page.viewportSize()!.width < 1024) await page.setViewportSize({ width: 320, height: 760 });
      for (const path of ["/dashboard/team", `/dashboard/team/${id}`, `/dashboard/team/${id}?tab=schedule`, `/dashboard/team/${id}?tab=account`]) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expectNoHorizontalScroll(page);
        await expectAccessible(page);
      }
    });
  }
});
