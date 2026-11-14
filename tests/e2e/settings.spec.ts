import { expect, test, type Page } from "@playwright/test";
import { bookingAt, CLIENT_A, cleanupDashboardData, client, londonDay, signInAs } from "./dashboard-helpers";
import { expectAccessible, expectNoHorizontalScroll, formAlert, setTheme, sql } from "./helpers";

/** Settings are put back exactly as they were after each test; test closed days and log entries are removed. */
const COLUMNS = [
  "shop_hours", "min_notice_minutes", "booking_window_days", "due_back_weeks", "max_open_requests", "change_cutoff_minutes",
  "google_rating", "google_review_count", "google_review_url", "public_theme", "walk_in_text", "discount_text",
  "online_booking",
];
let original: Record<string, unknown> = {};
let startedAt = new Date();

test.beforeEach(async () => {
  startedAt = new Date();
  [original] = await sql(`select ${COLUMNS.join(", ")} from public.settings where id = 1`);
});
test.afterEach(async () => {
  await sql(`update public.settings set ${COLUMNS.map((c, i) => `${c} = $${i + 1}`).join(", ")} where id = 1`, COLUMNS.map((c) => original[c]));
  await sql("delete from public.closures where reason like 'E2E%'");
  await sql("delete from public.audit_log where entity in ('settings', 'closure') and at >= $1", [startedAt]);
  await cleanupDashboardData();
});

const card = (page: Page, name: string) => page.getByRole("region", { name, exact: true });
const toast = (page: Page) => page.getByTestId("toast");

async function openSettings(page: Page) {
  await signInAs(page, "owner");
  await page.goto("/dashboard/settings");
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  await expect(card(page, "Opening hours").locator("form[data-ready]")).toBeVisible();
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const weekdayOf = (key: string) => {
  const js = new Date(`${key}T12:00:00Z`).getUTCDay();
  return { name: DAY_NAMES[js], iso: js === 0 ? 7 : js };
};

test.describe("settings", () => {
  test("opening hours: finish before start refused; closing a day warns about its bookings, saves, shows on the website", async ({ page }) => {
    const tomorrow = weekdayOf(await londonDay(1));
    const id = await bookingAt({ clientId: await client(CLIENT_A, "E2E Hours"), days: 1, time: "10:00" });
    await openSettings(page);
    const hours = card(page, "Opening hours");
    const other = tomorrow.iso === 1 ? { name: "Tuesday", iso: 2 } : { name: "Monday", iso: 1 };
    const finish = hours.getByLabel(`${other.name} finish`);
    const before = await finish.inputValue();

    await finish.selectOption({ label: "8:00am" });
    await hours.getByRole("button", { name: "Save opening hours" }).click();
    await expect(formAlert(page).filter({ hasText: "Please check the hours." })).toBeVisible();
    await expect(hours.getByText(`${other.name}: Finish time must be after the start time.`)).toBeVisible();
    await finish.selectOption(before);

    await hours.getByLabel(tomorrow.name, { exact: true }).uncheck();
    await hours.getByRole("button", { name: "Save opening hours" }).click();
    await expect(hours.getByRole("alert").filter({ hasText: /outside the new hours\. (It stays|They stay) booked/ })).toBeVisible();
    await hours.getByRole("button", { name: "Save anyway" }).click();
    await expect(toast(page)).toHaveText("Opening hours saved.");

    const [row] = await sql("select shop_hours -> $1 as day, shop_hours -> $2 as other from public.settings", [String(tomorrow.iso), String(other.iso)]);
    expect(row.day).toBeNull();
    expect(row.other).toEqual((original.shop_hours as Record<string, unknown>)[String(other.iso)]);
    const [b] = await sql("select status from public.bookings where id = $1", [id]);
    expect(b.status).toBe("confirmed"); // never moved or cancelled

    const logged = await sql("select action, changed from public.audit_log where entity = 'settings' and at >= $1", [startedAt]);
    expect(logged).toEqual([{ action: "settings.update", changed: ["shop_hours"] }]);

    await page.goto("/");
    await expect(page.locator("#visit dl")).toContainText("Closed");
  });

  test("closed days: warns about bookings that day, refuses duplicates, shows on the website, can be removed", async ({ page }) => {
    const day = await londonDay(3);
    await bookingAt({ clientId: await client(CLIENT_A, "E2E Closed"), days: 3, time: "11:00" });
    await openSettings(page);
    const closed = card(page, "Closed days");

    await closed.getByLabel("Date").fill(day);
    await closed.getByLabel(/^Reason/).fill("E2E Staff training");
    await closed.getByRole("button", { name: "Add closed day" }).click();
    await expect(closed.getByRole("alert").filter({ hasText: /^1 booking is on that day\. It stays booked/ })).toBeVisible();
    await closed.getByRole("button", { name: "Add anyway" }).click();
    await expect(toast(page)).toHaveText("Closed day added.");
    await expect(closed.getByTestId("closed-days")).toContainText("E2E Staff training");
    await expect(closed.getByLabel("Date")).toHaveValue("");

    await closed.getByLabel("Date").fill(day);
    await closed.getByLabel(/^Reason/).fill("E2E Again");
    await closed.getByRole("button", { name: "Add closed day" }).click();
    await closed.getByRole("button", { name: "Add anyway" }).click();
    await expect(closed.getByText("That day is already marked as closed.")).toBeVisible();
    await expect(closed.getByLabel(/^Reason/)).toHaveValue("E2E Again");

    await page.goto("/");
    await expect(page.getByTestId("upcoming-closures")).toContainText("E2E Staff training");

    await page.goto("/dashboard/settings");
    await card(page, "Closed days").getByRole("listitem").filter({ hasText: "E2E Staff training" }).getByRole("button", { name: /^Remove/ }).click();
    await expect(toast(page)).toHaveText("Closed day removed.");
    expect(await sql("select 1 from public.closures where reason like 'E2E%'")).toEqual([]);
  });

  test("booking rules, Google rating, website notes and theme save separately and reach the website", async ({ page }) => {
    await openSettings(page);

    const rules = card(page, "Booking rules");
    await rules.getByLabel("Minimum notice").selectOption({ label: "1 day" });
    await rules.getByLabel("How far ahead (days)").fill("45");
    await rules.getByRole("button", { name: "Save booking rules" }).click();
    await expect(toast(page)).toHaveText("Booking rules saved.");

    const google = card(page, "Google rating");
    await google.getByLabel("Rating (0 to 5)").fill("6");
    await google.getByLabel("Link to the Google reviews").fill("http://example.com");
    await google.getByRole("button", { name: "Save Google rating" }).click();
    await expect(google.getByText("Enter a rating between 0 and 5, e.g. 4.8.")).toBeVisible();
    await expect(google.getByText("Enter a link starting with https://")).toBeVisible();
    await google.getByLabel("Rating (0 to 5)").fill("4,7");
    await google.getByLabel("Number of reviews").fill("88");
    await google.getByLabel("Link to the Google reviews").fill("https://example.com/reviews");
    await google.getByRole("button", { name: "Save Google rating" }).click();
    await expect(toast(page)).toHaveText("Google rating saved.");

    const notes = card(page, "Website notes");
    await notes.getByLabel("Walk-ins").fill("E2E walk-ins\nwelcome   all day");
    await notes.getByRole("button", { name: "Save website notes" }).click();
    await expect(toast(page)).toHaveText("Website notes saved.");

    const theme = card(page, "Website theme");
    await theme.getByLabel(original.public_theme === "light" ? "Dark" : "Light").check();
    await theme.getByRole("button", { name: "Save website theme" }).click();
    await expect(toast(page)).toHaveText("Website theme saved.");

    const [s] = await sql(
      "select min_notice_minutes, booking_window_days, google_rating::text as rating, google_review_count, google_review_url, walk_in_text, public_theme from public.settings",
    );
    expect(s).toEqual({
      min_notice_minutes: 1440,
      booking_window_days: 45,
      rating: "4.7",
      google_review_count: 88,
      google_review_url: "https://example.com/reviews",
      walk_in_text: "E2E walk-ins welcome all day",
      public_theme: original.public_theme === "light" ? "dark" : "light",
    });
    // Saving one card didn't undo another.
    await page.reload();
    await expect(card(page, "Booking rules").getByLabel("How far ahead (days)")).toHaveValue("45");

    await page.goto("/");
    await expect(page.locator("#main")).toContainText("4.7 on Google");
    await expect(page.locator("#visit")).toContainText("E2E walk-ins welcome all day");
    await expect(page.locator("html")).toHaveClass(original.public_theme === "light" ? /\bdark\b/ : /^(?!.*\bdark\b)/);
  });

  test("online booking switch: Off shows the call panel on /book and refuses the API; On brings booking back", async ({ page, request }) => {
    await openSettings(page);
    const online = card(page, "Online booking");
    await online.getByRole("radio", { name: /^Off/ }).check({ force: true });
    await online.getByRole("button", { name: "Save online booking" }).click();
    await expect(toast(page)).toHaveText("Online booking is off.");
    expect((await sql("select online_booking from public.settings"))[0].online_booking).toBe(false);

    await page.goto("/book");
    await expect(page.getByText(/isn't available right now/)).toBeVisible();
    const [{ id }] = await sql("select id from public.services where name = 'Hair Cut'");
    expect((await request.get(`/api/availability?service=${id}`)).status()).toBe(404);

    await page.goto("/dashboard/settings");
    await online.getByRole("radio", { name: /^On/ }).check({ force: true });
    await online.getByRole("button", { name: "Save online booking" }).click();
    await expect(toast(page)).toHaveText("Online booking is on.");
    await page.goto("/book");
    await expect(page.getByTestId("step-heading")).toHaveText("Choose a service");
  });

  for (const theme of ["light", "dark"] as const) {
    test(`WCAG 2.1 AA and no sideways scroll (${theme})`, async ({ page }) => {
      await setTheme(page, "dashboard", theme);
      await openSettings(page);
      if (page.viewportSize()!.width < 1024) {
        await page.setViewportSize({ width: 320, height: 760 });
        await expect(page.getByRole("navigation", { name: "Jump to" })).toBeVisible();
      }
      await expectNoHorizontalScroll(page);
      await expectAccessible(page);
    });
  }
});
