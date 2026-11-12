import { expect, test, type Page } from "@playwright/test";
import { londonParts } from "../../src/lib/domain/time";
import { expectAccessible, expectNoHorizontalScroll, setTheme, signIn, sql } from "./helpers";

/** Test clients: 07700 9007xx (Ofcom drama range). */
const PHONE_LIKE = "+4477009007%";
const CLIENT_A = "+447700900701";
const CLIENT_B = "+447700900702";

async function cleanup() {
  await sql(`delete from public.bookings where client_id in (select id from public.clients where phone like '${PHONE_LIKE}')`);
  await sql(`delete from public.clients where phone like '${PHONE_LIKE}'`);
}
test.beforeEach(cleanup);
test.afterEach(cleanup);

async function client(phone: string, name: string): Promise<string> {
  const [row] = await sql("insert into public.clients (name, phone) values ($1, $2) returning id", [name, phone]);
  return row.id;
}

/** A 30-minute Hair Cut starting `startMin` minutes from now (whole minutes), created `createdMin` minutes from now. */
async function booking(opts: {
  clientId: string;
  barber?: string;
  startMin: number;
  status?: string;
  createdMin?: number;
  changedFrom?: string | null;
}): Promise<string> {
  const [row] = await sql(
    `insert into public.bookings (client_id, staff_id, service_id, service_name, price_pence, duration_min, starts_at, ends_at,
       status, source, created_at, changed_from)
     select $1, st.id, sv.id, sv.name, sv.price_pence, 30,
       date_trunc('minute', now()) + make_interval(mins => $2), date_trunc('minute', now()) + make_interval(mins => $2),
       $3, 'online', now() + make_interval(mins => $4), $5
     from public.staff st, public.services sv where st.username = $6 and sv.name = 'Hair Cut'
     returning id`,
    [opts.clientId, opts.startMin, opts.status ?? "confirmed", opts.createdMin ?? -5, opts.changedFrom ?? null, opts.barber ?? "jamie"],
  );
  return row.id;
}

/** Bookings "today" need room before midnight (London) on both sides. */
function skipNearMidnight() {
  const { hour } = londonParts(new Date());
  test.skip(hour < 2 || hour >= 21, "Needs a few hours of today left (London time).");
}

async function signInAs(page: Page, username: string) {
  await page.goto("/login");
  await signIn(page, username);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId("greeting")).toBeVisible();
}

const isPhone = (page: Page) => page.viewportSize()!.width < 1024;
const navLinks = (page: Page) =>
  page.getByRole("navigation", { name: "Dashboard" }).getByRole("link");

test.describe("dashboard shell", () => {
  test("owner: tabs/sidebar, header with role, bell count, More menu without Backup", async ({ page }) => {
    await signInAs(page, "owner");
    await expect(page.getByTestId("signed-in-as")).toHaveText("SAMPLE Owner · Owner");
    await expect(navLinks(page)).toHaveText(["Today", "Calendar", "Clients", "Team", "More"]);
    await expect(navLinks(page).first()).toHaveAttribute("aria-current", "page");

    const [{ count }] = await sql("select count(*)::int as count from public.bookings where status = 'pending'");
    await expect(page.getByTestId("requests-bell")).toHaveAccessibleName(`Requests: ${count} waiting`);
    await page.getByTestId("requests-bell").click();
    await expect(page).toHaveURL(/\/dashboard#requests$/);

    await navLinks(page).filter({ hasText: "More" }).click();
    await expect(page.getByRole("heading", { name: "More", level: 1 })).toBeVisible();
    const main = page.getByRole("main");
    await expect(main.getByRole("link")).toHaveText(["Services and prices", "Website", "Settings", "Activity", "Account", "View the website"]);
    await main.getByRole("link", { name: "Settings" }).click();
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
    await expect(navLinks(page).filter({ hasText: "More" })).toHaveAttribute("aria-current", "page");

    // Admin-only page: "not found" inside the shell.
    await page.goto("/dashboard/backup");
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(navLinks(page)).toHaveCount(5);
  });

  test("admin: More includes Backup", async ({ page }) => {
    await signInAs(page, "admin");
    await page.goto("/dashboard/more");
    await expect(page.getByRole("main").getByRole("link", { name: "Backup" })).toBeVisible();
    await page.getByRole("main").getByRole("link", { name: "Backup" }).click();
    await expect(page.getByRole("heading", { name: "Backup", level: 1 })).toBeVisible();
  });

  test("barber: Today · Calendar · Clients · Me; owner pages are not found", async ({ page }) => {
    await signInAs(page, "sam");
    await expect(page.getByTestId("signed-in-as")).toHaveText("SAMPLE Sam · Barber");
    await expect(navLinks(page)).toHaveText(["Today", "Calendar", "Clients", "Me"]);
    for (const path of ["/dashboard/team", "/dashboard/more", "/dashboard/settings", "/dashboard/website", "/dashboard/activity", "/dashboard/backup"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: "Page not found" }), path).toBeVisible();
    }
    await navLinks(page).filter({ hasText: "Me" }).click();
    await expect(page.getByRole("heading", { name: "Account", level: 1 })).toBeVisible();
    await expect(navLinks(page).filter({ hasText: "Me" })).toHaveAttribute("aria-current", "page");
  });

  test("unknown dashboard address: not found inside the shell", async ({ page }) => {
    await signInAs(page, "owner");
    await page.goto("/dashboard/no-such-page");
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await page.getByRole("link", { name: "Back to Today" }).click();
    await expect(page.getByTestId("greeting")).toBeVisible();
  });

  test("dashboard theme toggle is separate from the website's; staff login link uses the dashboard theme", async ({ page }) => {
    await setTheme(page, "site", "dark");
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.getByRole("link", { name: "Staff login" }).click();
    await expect(page).toHaveURL(/\/login$/);
    // Dashboard follows the system (light) until changed.
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    await signIn(page, "owner");
    await expect(page.getByTestId("greeting")).toBeVisible();
    await page.getByRole("button", { name: "Switch to dark theme" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    expect(await page.evaluate(() => [localStorage.getItem("salsa-dashboard-theme"), localStorage.getItem("salsa-site-theme")])).toEqual([
      "dark",
      "dark",
    ]);
    await page.getByRole("button", { name: "Switch to light theme" }).click();
    expect(await page.evaluate(() => localStorage.getItem("salsa-site-theme"))).toBe("dark");
  });

  test("sign out from the header", async ({ page }) => {
    await signInAs(page, "jamie");
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login\?message=signed_out$/);
  });

  test("phone tab bar steps aside while a text field has focus", async ({ page }) => {
    await signInAs(page, "owner");
    test.skip(!isPhone(page), "Phones only.");
    const tabs = page.getByRole("navigation", { name: "Dashboard" });
    await expect(tabs).toBeInViewport();
    await page.evaluate(() => {
      const input = document.createElement("input");
      input.setAttribute("aria-label", "Test field");
      document.querySelector("main")!.prepend(input);
    });
    await page.getByLabel("Test field").focus();
    await expect(tabs).toHaveAttribute("data-typing", "true");
    await expect(tabs).not.toBeInViewport();
    await page.getByLabel("Test field").blur();
    await expect(tabs).not.toHaveAttribute("data-typing");
    await expect(tabs).toBeInViewport();
  });
});

test.describe("Today", () => {
  test("owner: requests with flags, needs closing, next up, schedule with now line and barber filter", async ({ page }) => {
    skipNearMidnight();
    const a = await client(CLIENT_A, "E2E Ada");
    const b = await client(CLIENT_B, "E2E Bo");
    const old = await booking({ clientId: b, startMin: 24 * 60 * 3, status: "cancelled", createdMin: -60 * 30 });
    // Ada: a request waiting 13 hours for tomorrow, plus another confirmed booking (same number).
    await booking({ clientId: a, startMin: 24 * 60 + 60, status: "pending", createdMin: -13 * 60 });
    await booking({ clientId: a, startMin: 90, status: "confirmed" });
    // Bo: changed their booking (new request); an expired request; one that finished without Done.
    await booking({ clientId: b, startMin: 24 * 60 * 2, status: "pending", changedFrom: old, barber: "sam" });
    await booking({ clientId: b, startMin: -45, status: "pending", createdMin: -120 });
    await booking({ clientId: b, startMin: -100, status: "confirmed" });
    // In progress now.
    await booking({ clientId: b, startMin: -10, status: "confirmed", barber: "owner" });

    await signInAs(page, "owner");
    const requests = page.getByTestId("requests");
    const ada = requests.getByTestId("booking-card").filter({ hasText: "E2E Ada" });
    await expect(ada).toContainText("Tomorrow");
    await expect(ada).toContainText("Waiting over 12 hours");
    await expect(ada).toContainText("Same number has another booking");
    await expect(requests.getByTestId("booking-card").filter({ hasText: "Changed by customer" })).toContainText("E2E Bo");
    await expect(requests.getByTestId("booking-card").filter({ hasText: "Expired" })).toContainText("E2E Bo");
    // Soonest first: the expired one leads.
    await expect(requests.getByTestId("booking-card").first()).toContainText("Expired");

    await expect(page.getByTestId("needs-closing").getByTestId("booking-card").filter({ hasText: "E2E Bo" })).toHaveCount(1);

    const next = page.getByTestId("next-up").getByTestId("booking-card");
    await expect(next.filter({ hasText: "E2E Bo" })).toContainText("Now");
    await expect(next.filter({ hasText: "E2E Ada" })).toContainText(/in 1 hr (29|30) min/);

    // Now line sits after the in-progress booking and before Ada's.
    const schedule = page.getByTestId("schedule");
    const order = await schedule.locator(":scope > li").evaluateAll((items) =>
      items.map((li) => (li.getAttribute("data-testid") === "now-line" ? "NOW" : (li.textContent ?? ""))),
    );
    const nowAt = order.indexOf("NOW");
    expect(nowAt).toBeGreaterThan(0);
    expect(order.slice(nowAt + 1).some((t) => t.includes("E2E Ada"))).toBe(true);
    expect(order.slice(0, nowAt).some((t) => t.includes("E2E Bo") && t.includes("SAMPLE Owner"))).toBe(true);

    // Barber filter: instant, and only that barber's bookings.
    const filter = page.getByRole("group", { name: "Show bookings for" });
    await filter.getByRole("button", { name: "SAMPLE Jamie" }).click();
    await expect(filter.getByRole("button", { name: "SAMPLE Jamie" })).toHaveAttribute("aria-pressed", "true");
    await expect(schedule.getByTestId("booking-card").filter({ hasText: "SAMPLE Owner" })).toHaveCount(0);
    await expect(schedule.getByTestId("booking-card").filter({ hasText: "E2E Ada" })).toHaveCount(1);
    await filter.getByRole("button", { name: "Everyone" }).click();
    await expect(schedule.getByTestId("booking-card").filter({ hasText: "SAMPLE Owner" }).first()).toBeVisible();

    await expect(page.getByTestId("today-stats")).toContainText("Shop takings");
  });

  test("booking details sheet: details, Call, closes with Esc and returns focus", async ({ page }) => {
    const a = await client(CLIENT_A, "E2E Ada");
    await booking({ clientId: a, startMin: 24 * 60 + 60, status: "pending", createdMin: -13 * 60 });
    await signInAs(page, "owner");

    const card = page.getByTestId("requests").getByTestId("booking-card").filter({ hasText: "E2E Ada" });
    await card.click();
    const sheet = page.getByRole("dialog", { name: "E2E Ada" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTestId("booking-details")).toContainText("Hair Cut · £17");
    await expect(sheet.getByTestId("booking-details")).toContainText("SAMPLE Jamie");
    await expect(sheet.getByTestId("booking-details")).toContainText("07700 900701");
    await expect(sheet.getByTestId("booking-details")).toContainText("Waiting over 12 hours");
    await expect(sheet.getByRole("link", { name: "Call 07700 900701" })).toHaveAttribute("href", `tel:${CLIENT_A}`);
    // Page behind doesn't scroll.
    expect(await page.evaluate(() => document.body.style.position)).toBe("fixed");

    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(card).toBeFocused();
    expect(await page.evaluate(() => document.body.style.position)).toBe("");

    await card.click();
    await sheet.getByRole("button", { name: "Close" }).click();
    await expect(sheet).toBeHidden();
  });

  test("barber sees only their own bookings, their own takings and no barber filter", async ({ page }) => {
    skipNearMidnight();
    const a = await client(CLIENT_A, "E2E Ada");
    const b = await client(CLIENT_B, "E2E Bo");
    await booking({ clientId: a, startMin: 60, status: "confirmed", barber: "jamie" });
    await booking({ clientId: b, startMin: 24 * 60, status: "pending", barber: "jamie" });

    await signInAs(page, "sam");
    await expect(page.getByRole("main")).not.toContainText("E2E Ada");
    await expect(page.getByRole("main")).not.toContainText("E2E Bo");
    await expect(page.getByRole("group", { name: "Show bookings for" })).toHaveCount(0);
    await expect(page.getByTestId("today-stats")).toContainText("Your takings");
    const [{ count }] = await sql(
      "select count(*)::int as count from public.bookings b join public.staff s on s.id = b.staff_id where status = 'pending' and s.username = 'sam'",
    );
    await expect(page.getByTestId("requests-bell")).toHaveAccessibleName(`Requests: ${count} waiting`);

    await page.getByRole("button", { name: "Sign out" }).click();
    await signInAs(page, "jamie");
    await expect(page.getByTestId("next-up")).toContainText("E2E Ada");
    await expect(page.getByTestId("requests")).toContainText("E2E Bo");
  });

  test("refreshes every 60 s; waits while a sheet is open, then catches up", async ({ page }) => {
    await page.clock.install();
    const a = await client(CLIENT_A, "E2E Ada");
    await signInAs(page, "owner");
    await expect(page.getByRole("main")).not.toContainText("E2E Ada");

    await booking({ clientId: a, startMin: 24 * 60 + 60, status: "pending" });
    await page.clock.runFor(61_000);
    await expect(page.getByTestId("requests")).toContainText("E2E Ada");

    const b = await client(CLIENT_B, "E2E Bo");
    await page.getByTestId("requests").getByTestId("booking-card").first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await booking({ clientId: b, startMin: 24 * 60 + 120, status: "pending" });
    await page.clock.runFor(61_000);
    await page.waitForTimeout(1_000);
    await expect(page.getByTestId("requests")).not.toContainText("E2E Bo");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("requests")).toContainText("E2E Bo");
  });
});

test.describe("dashboard quality", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`WCAG 2.1 AA: Today, details sheet and More (${theme})`, async ({ page }) => {
      const a = await client(CLIENT_A, "E2E Ada");
      await booking({ clientId: a, startMin: 24 * 60 + 60, status: "pending", createdMin: -13 * 60, changedFrom: null });
      await setTheme(page, "dashboard", theme);
      await signInAs(page, "owner");
      await expect(page.locator("html")).toHaveClass(theme === "dark" ? /dark/ : /^(?!.*dark)/);
      await expectAccessible(page);
      await page.getByTestId("requests").getByTestId("booking-card").first().click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expectAccessible(page);
      await page.keyboard.press("Escape");
      await page.goto("/dashboard/more");
      await expect(page.getByRole("heading", { name: "More" })).toBeVisible();
      await expectAccessible(page);
    });
  }

  for (const width of [320, 375, 430]) {
    test(`no sideways scroll at ${width}px`, async ({ page }) => {
      test.skip(page.viewportSize()!.width >= 1024, "Phone widths only.");
      await page.setViewportSize({ width, height: 800 });
      await signInAs(page, "owner");
      await expectNoHorizontalScroll(page);
      await page.getByTestId("booking-card").first().click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expectNoHorizontalScroll(page);
    });
  }

  test("dashboard pages are not indexed", async ({ page }) => {
    await signInAs(page, "owner");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });
});
