import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "./dashboard-helpers";
import { expectAccessible, expectNoHorizontalScroll, setTheme, sql } from "./helpers";

/** Log entries are inserted directly (summaries start with "E2E") and removed after each test. */
test.afterEach(async () => {
  await sql("delete from public.audit_log where summary like 'E2E %'");
});

async function entry(username: string, action: string, entity: string, summary: string, changed: string[] | null = null) {
  await sql(
    `insert into public.audit_log (actor_id, actor_name, action, entity, summary, changed)
     select id, display_name, $2, $3, $4, $5 from public.staff where username = $1`,
    [username, action, entity, summary, changed],
  );
}

const entries = (page: Page) => page.getByTestId("activity-entry");

async function openActivity(page: Page, user = "owner", query = "") {
  await signInAs(page, user);
  await page.goto(`/dashboard/activity${query}`);
  await expect(page.getByRole("heading", { name: "Activity", level: 1 })).toBeVisible();
}

test.describe("activity log", () => {
  test("readable labels and changes; owners don't see admin entries, admins do", async ({ page }) => {
    await entry("owner", "service.update", "service", "E2E Hair Cut · £17.00 · 30 min", ["price_pence", "duration_min"]);
    await entry("admin", "settings.update", "settings", "E2E admin change", ["google_rating"]);
    await openActivity(page);
    const mine = entries(page).filter({ hasText: "E2E Hair Cut" });
    await expect(mine).toContainText("Service edited by SAMPLE Owner");
    await expect(mine).toContainText("E2E Hair Cut · £17.00 · 30 min · Changed price and length");
    await expect(page.getByRole("heading", { name: "Today", level: 2 })).toBeVisible();
    await expect(entries(page).filter({ hasText: "SAMPLE Admin" })).toHaveCount(0);

    await page.context().clearCookies();
    await openActivity(page, "admin");
    await expect(entries(page).filter({ hasText: "Settings changed by SAMPLE Admin" }).first()).toContainText("Changed Google rating");
  });

  test("filters by type and person (in the URL); 50 at a time with 'Show older'", async ({ page }) => {
    for (let i = 0; i < 55; i++) await entry("sam", "review.update", "review", `E2E review ${String(i).padStart(2, "0")}`);
    await entry("owner", "service.create", "service", "E2E New service");
    await openActivity(page);

    await page.getByLabel("Type").selectOption({ label: "Website" });
    await expect(page).toHaveURL(/type=website/);
    await expect(entries(page)).toHaveCount(50);
    await expect(entries(page).first()).toContainText("E2E review 54");
    await expect(entries(page).filter({ hasText: "E2E New service" })).toHaveCount(0);

    await page.getByRole("link", { name: "Show older" }).click();
    await expect(page).toHaveURL(/before=\d+/);
    await expect(entries(page).filter({ hasText: "E2E review 00" })).toHaveCount(1);
    await expect(entries(page).filter({ hasText: "E2E review 54" })).toHaveCount(0);
    await page.getByRole("link", { name: "Back to the newest" }).click();
    await expect(entries(page).first()).toContainText("E2E review 54");

    await page.goto("/dashboard/activity");
    await page.getByLabel("Person").selectOption({ label: "SAMPLE Owner (owner)" });
    await expect(page).toHaveURL(/person=/);
    await expect(entries(page).filter({ hasText: "E2E New service" })).toHaveCount(1);
    await expect(entries(page).filter({ hasText: "E2E review" })).toHaveCount(0);
  });

  for (const theme of ["light", "dark"] as const) {
    test(`WCAG 2.1 AA and no sideways scroll (${theme})`, async ({ page }) => {
      await entry("owner", "closure.insert", "closure", "E2E Thu 25 Dec 2026 · Christmas Day with a long reason to wrap");
      await setTheme(page, "dashboard", theme);
      await openActivity(page);
      if (page.viewportSize()!.width < 1024) await page.setViewportSize({ width: 320, height: 760 });
      await expectNoHorizontalScroll(page);
      await expectAccessible(page);
    });
  }
});
