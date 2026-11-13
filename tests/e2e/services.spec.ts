import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "./dashboard-helpers";
import { expectAccessible, expectNoHorizontalScroll, formAlert, setTheme, sql } from "./helpers";

/** Test services are named "E2E …"; the original order is restored after each test. */
let originalOrder: { id: string; sort: number }[] = [];
test.beforeEach(async () => {
  originalOrder = await sql("select id, sort from public.services where name not like 'E2E %'");
});
test.afterEach(async () => {
  await sql("delete from public.audit_log where entity = 'service' and summary like 'E2E %'");
  await sql("delete from public.services where name like 'E2E %'");
  for (const s of originalOrder) await sql("update public.services set sort = $2 where id = $1 and sort <> $2", [s.id, s.sort]);
});

const rows = (page: Page) => page.getByTestId("service-row");
const sheet = (page: Page) => page.getByRole("dialog");

async function openServices(page: Page, user = "owner") {
  await signInAs(page, user);
  await page.goto("/dashboard/services");
  await expect(page.getByRole("heading", { name: "Services and prices" })).toBeVisible();
  await expect(rows(page).first()).toBeVisible();
}

async function openForm(page: Page, button: RegExp | string) {
  await page.getByRole("button", { name: button }).click();
  await expect(sheet(page).locator("form[data-ready]")).toBeVisible();
}

test.describe("services", () => {
  test("add a service with booking days: every bookable barber offers it; the website price list shows it", async ({ page }) => {
    await openServices(page);
    await openForm(page, "Add service");
    await sheet(page).getByRole("button", { name: "Add service" }).click();
    await expect(sheet(page).getByText("Please enter a name.")).toBeVisible();

    await sheet(page).getByLabel("Name").fill("E2E Test Cut");
    await sheet(page).getByLabel("Price (£)").fill("12.5");
    await sheet(page).getByLabel("Length").selectOption("25");
    for (const day of ["Friday", "Saturday", "Sunday"]) await sheet(page).getByLabel(day).uncheck();
    await sheet(page).getByRole("button", { name: "Add service" }).click();
    await expect(page.getByTestId("toast")).toHaveText("E2E Test Cut added.");
    await expect(sheet(page)).toBeHidden();
    await expect(rows(page).filter({ hasText: "E2E Test Cut" })).toContainText("£12.50 · 25 min · online Mon–Thu only");

    const [row] = await sql(
      `select s.price_pence, s.duration_min, s.bookable_days, s.active,
         (select count(*)::int from public.staff_services ss where ss.service_id = s.id) as barbers,
         (select count(*)::int from public.staff where bookable and active and deleted_at is null and role <> 'admin') as bookable
       from public.services s where s.name = 'E2E Test Cut'`,
    );
    expect(row).toMatchObject({ price_pence: 1250, duration_min: 25, bookable_days: [1, 2, 3, 4], active: true });
    expect(row.barbers).toBe(row.bookable);

    await page.goto("/");
    await expect(page.locator("#services")).toContainText("E2E Test Cut");
  });

  test("edit: bad price refused with values kept; saved; switch off hides it from the website", async ({ page }) => {
    await sql("insert into public.services (name, price_pence, duration_min, sort) values ('E2E Edit Me', 1000, 30, 990)");
    await openServices(page);
    await openForm(page, "Edit E2E Edit Me");
    await sheet(page).getByLabel("Name").fill("E2E Edited");
    await sheet(page).getByLabel("Price (£)").fill("ten");
    await sheet(page).getByRole("button", { name: "Save" }).click();
    await expect(formAlert(page)).toHaveText("Please check the details.");
    await expect(sheet(page).getByLabel("Name")).toHaveValue("E2E Edited");
    await sheet(page).getByLabel("Price (£)").fill("11");
    await sheet(page).getByRole("button", { name: "Save" }).click();
    await expect(page.getByTestId("toast")).toHaveText("E2E Edited saved.");
    await expect(rows(page).filter({ hasText: "E2E Edited" })).toContainText("£11");

    await openForm(page, "Edit E2E Edited");
    await sheet(page).getByRole("button", { name: "Switch off" }).click();
    await expect(page.getByTestId("toast")).toHaveText("E2E Edited switched off.");
    await expect(rows(page).filter({ hasText: "E2E Edited" })).toContainText("Switched off");
    await page.goto("/");
    await expect(page.locator("#services")).not.toContainText("E2E Edited");
  });

  test("delete: refused for a booked service; allowed for a never-booked one", async ({ page }) => {
    await sql("insert into public.services (name, price_pence, duration_min, sort) values ('E2E Delete Me', 500, 15, 995)");
    await openServices(page);
    await openForm(page, "Edit Hair Cut");
    await sheet(page).getByRole("button", { name: "Delete" }).click();
    await expect(sheet(page).getByRole("button", { name: "Keep" })).toBeFocused();
    await sheet(page).getByRole("button", { name: "Delete service" }).click();
    await expect(formAlert(page)).toContainText("This service has bookings, so it can't be deleted.");
    await page.keyboard.press("Escape");

    await openForm(page, "Edit E2E Delete Me");
    await sheet(page).getByRole("button", { name: "Delete" }).click();
    await sheet(page).getByRole("button", { name: "Delete service" }).click();
    await expect(page.getByTestId("toast")).toHaveText("E2E Delete Me deleted.");
    await expect(rows(page).filter({ hasText: "E2E Delete Me" })).toHaveCount(0);
  });

  test("reorder: instant, saved, and logged once as 'Services reordered'", async ({ page }) => {
    await openServices(page);
    const before = await rows(page).locator("p.font-semibold").allTextContents();
    if (page.viewportSize()!.width < 1024) await page.getByRole("button", { name: "Reorder" }).click();
    await page.getByRole("button", { name: `Move ${before[0]} down` }).click();
    await expect(rows(page).nth(0)).toContainText(before[1]);
    await expect(rows(page).nth(1)).toContainText(before[0]);
    await expect
      .poll(async () => (await sql("select name from public.services order by sort, name limit 2")).map((r) => r.name))
      .toEqual([before[1], before[0]]);
    await page.reload();
    await expect(rows(page).nth(0)).toContainText(before[1]);
    const logged = await sql("select action from public.audit_log where entity = 'service' and at > now() - interval '1 minute' order by id");
    expect(logged.map((r) => r.action).every((a) => a === "service.reorder")).toBe(true);
    await sql("delete from public.audit_log where entity = 'service' and action = 'service.reorder' and at > now() - interval '1 minute'");
  });

  test("barbers: read-only", async ({ page }) => {
    await openServices(page, "sam");
    await expect(page.getByRole("button", { name: "Add service" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Edit / })).toHaveCount(0);
    await expect(page.getByText("Prices and lengths are set by the owner.")).toBeVisible();
  });

  for (const theme of ["light", "dark"] as const) {
    test(`WCAG 2.1 AA and no sideways scroll (${theme})`, async ({ page }) => {
      await setTheme(page, "dashboard", theme);
      await openServices(page);
      if (page.viewportSize()!.width < 1024) await page.setViewportSize({ width: 320, height: 760 });
      await expectNoHorizontalScroll(page);
      await expectAccessible(page);
      await openForm(page, "Edit Hair Cut");
      await expectAccessible(page);
    });
  }
});
