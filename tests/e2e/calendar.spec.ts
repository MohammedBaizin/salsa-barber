import { expect, test, type Page } from "@playwright/test";
import { bookingAt, CLIENT_A, CLIENT_B, cleanupDashboardData, client, londonDay, signInAs } from "./dashboard-helpers";
import { expectAccessible, expectNoHorizontalScroll, setTheme, sql } from "./helpers";

test.beforeEach(cleanupDashboardData);
test.afterEach(cleanupDashboardData);

const dayList = (page: Page) => page.getByTestId("day-list");
const isDesktop = (page: Page) => page.viewportSize()!.width >= 1024;

async function openCalendar(page: Page, user = "owner") {
  await signInAs(page, user);
  await page.getByRole("navigation", { name: "Dashboard" }).getByRole("link", { name: "Calendar" }).click();
  await expect(page.getByRole("heading", { name: "Calendar", level: 1 })).toBeVisible();
}

test.describe("calendar", () => {
  test("week strip: counts for screen readers, choosing a day, weeks keep the weekday, back to today, Back works", async ({ page }) => {
    const a = await client(CLIENT_A, "E2E Ada");
    const b = await client(CLIENT_B, "E2E Bo");
    await bookingAt({ clientId: a, days: 1, time: "07:00" });
    await bookingAt({ clientId: b, days: 1, time: "08:00", barber: "sam" });
    const today = await londonDay(0);
    const tomorrow = await londonDay(1);
    await openCalendar(page);
    await expect(page.getByTestId(`day-${today}`)).toHaveAttribute("aria-current", "date");

    const tomorrowLink = page.getByTestId(`day-${tomorrow}`);
    // Tomorrow may fall in next week (Sunday today).
    if (await tomorrowLink.count()) {
      await expect(tomorrowLink).toHaveAccessibleName(/: \d+ bookings?$/);
      await tomorrowLink.click();
    } else {
      await page.goto(`/dashboard/calendar?date=${tomorrow}`);
    }
    await expect(page).toHaveURL(new RegExp(`date=${tomorrow}`));
    await expect(page.getByTestId(`day-${tomorrow}`)).toHaveAttribute("aria-current", "date");
    await expect(dayList(page)).toContainText("E2E Ada");
    await expect(dayList(page)).toContainText("E2E Bo");

    await page.getByRole("link", { name: "Next week" }).click();
    const nextWeek = await londonDay(8);
    await expect(page).toHaveURL(new RegExp(`date=${nextWeek}`));
    await expect(page.getByTestId(`day-${nextWeek}`)).toHaveAttribute("aria-current", "date");

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`date=${tomorrow}`));
    await expect(dayList(page)).toContainText("E2E Ada");

    await page.getByRole("link", { name: "Back to today" }).click();
    await expect(page).toHaveURL(/\/dashboard\/calendar$/);
    await expect(page.getByRole("link", { name: "Back to today" })).toHaveCount(0);
  });

  test("barber filter and 'Show cancelled and declined' live in the URL", async ({ page }) => {
    const a = await client(CLIENT_A, "E2E Ada");
    const b = await client(CLIENT_B, "E2E Bo");
    await bookingAt({ clientId: a, days: 1, time: "07:00" });
    await bookingAt({ clientId: b, days: 1, time: "08:00", barber: "sam", status: "cancelled" });
    const tomorrow = await londonDay(1);
    await signInAs(page, "owner");
    await page.goto(`/dashboard/calendar?date=${tomorrow}`);
    await expect(dayList(page)).toContainText("E2E Ada");
    await expect(page.getByRole("main")).not.toContainText("E2E Bo");

    const toggle = page.getByRole("switch", { name: "Show cancelled and declined" });
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await toggle.click();
    await expect(page).toHaveURL(/all=1/);
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await expect(dayList(page).getByTestId("booking-card").filter({ hasText: "E2E Bo" })).toHaveAttribute("data-status", "cancelled");

    const filter = page.getByRole("navigation", { name: "Barber" });
    await filter.getByRole("link", { name: "SAMPLE Jamie" }).click();
    await expect(page).toHaveURL(/barber=[0-9a-f-]{36}/);
    await expect(filter.getByRole("link", { name: "SAMPLE Jamie" })).toHaveAttribute("aria-current", "true");
    await expect(dayList(page)).toContainText("E2E Ada");
    await expect(page.getByRole("main")).not.toContainText("E2E Bo");

    // Reload: the same view comes back from the URL.
    await page.reload();
    await expect(filter.getByRole("link", { name: "SAMPLE Jamie" })).toHaveAttribute("aria-current", "true");
    await expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  test("desktop: a column per barber when showing everyone", async ({ page }) => {
    test.skip(!isDesktop(page), "Desktop layout.");
    const a = await client(CLIENT_A, "E2E Ada");
    const b = await client(CLIENT_B, "E2E Bo");
    await bookingAt({ clientId: a, days: 1, time: "07:00" });
    await bookingAt({ clientId: b, days: 1, time: "07:00", barber: "sam" });
    await signInAs(page, "owner");
    await page.goto(`/dashboard/calendar?date=${await londonDay(1)}`);
    const ada = dayList(page).getByTestId("booking-card").filter({ hasText: "E2E Ada" });
    const bo = dayList(page).getByTestId("booking-card").filter({ hasText: "E2E Bo" });
    await expect(ada).toBeVisible();
    await expect(bo).toBeVisible();
    const [adaBox, boBox] = [await ada.boundingBox(), await bo.boundingBox()];
    // Same time, side by side in different columns.
    expect(Math.abs(adaBox!.y - boBox!.y)).toBeLessThan(5);
    expect(Math.abs(adaBox!.x - boBox!.x)).toBeGreaterThan(100);
  });

  test("Upcoming: grouped by day; Walk-in/Booking start on the selected day", async ({ page }) => {
    const a = await client(CLIENT_A, "E2E Ada");
    await bookingAt({ clientId: a, days: 2, time: "07:00" });
    await signInAs(page, "owner");
    const day = await londonDay(2);
    await page.goto(`/dashboard/calendar?date=${day}`);
    await page.getByRole("button", { name: "Booking", exact: true }).click();
    await expect(page.getByRole("dialog").getByLabel("Date")).toHaveValue(day);
    await page.keyboard.press("Escape");

    await page.getByRole("navigation", { name: "Calendar view" }).getByRole("link", { name: "Upcoming" }).click();
    await expect(page).toHaveURL(/view=upcoming/);
    const upcoming = page.getByTestId("upcoming");
    await expect(upcoming.getByRole("heading", { name: /E2E/ })).toHaveCount(0);
    await expect(upcoming).toContainText("E2E Ada");
  });

  test("barbers see only their own bookings and no barber filter", async ({ page }) => {
    const a = await client(CLIENT_A, "E2E Ada");
    const b = await client(CLIENT_B, "E2E Bo");
    await bookingAt({ clientId: a, days: 1, time: "07:00" });
    await bookingAt({ clientId: b, days: 1, time: "07:00", barber: "sam" });
    await signInAs(page, "sam");
    await page.goto(`/dashboard/calendar?date=${await londonDay(1)}`);
    await expect(dayList(page)).toContainText("E2E Bo");
    await expect(page.getByRole("main")).not.toContainText("E2E Ada");
    await expect(page.getByRole("navigation", { name: "Barber" })).toHaveCount(0);
    // A barber filter in the URL can't widen what they see.
    const [{ id }] = await sql("select id from public.staff where username = 'jamie'");
    await page.goto(`/dashboard/calendar?date=${await londonDay(1)}&barber=${id}`);
    await expect(page.getByRole("main")).not.toContainText("E2E Ada");
  });

  for (const theme of ["light", "dark"] as const) {
    test(`WCAG 2.1 AA and no sideways scroll (${theme})`, async ({ page }) => {
      const a = await client(CLIENT_A, "E2E Ada");
      await bookingAt({ clientId: a, days: 0, time: "23:00" });
      await setTheme(page, "dashboard", theme);
      await signInAs(page, "owner");
      if (!isDesktop(page)) await page.setViewportSize({ width: 320, height: 760 });
      await page.goto("/dashboard/calendar");
      await expect(page.getByRole("heading", { name: "Calendar", level: 1 })).toBeVisible();
      await expectNoHorizontalScroll(page);
      await expectAccessible(page);
      await page.goto("/dashboard/calendar?view=upcoming&all=1");
      await expect(page.getByTestId("upcoming")).toBeVisible();
      await expectNoHorizontalScroll(page);
      await expectAccessible(page);
    });
  }
});
