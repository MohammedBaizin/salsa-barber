import { expect, test, type Page } from "@playwright/test";
import { bookingAt, CLIENT_A, cleanupDashboardData, client, londonDay, signInAs } from "./dashboard-helpers";
import { expectAccessible, expectNoHorizontalScroll, formAlert, setTheme, sql } from "./helpers";

test.beforeEach(cleanupDashboardData);
test.afterEach(cleanupDashboardData);

const ALEX = "20000000-0000-4000-8000-000000000001";
const DAN = "20000000-0000-4000-8000-000000000004";
const rows = (page: Page) => page.getByTestId("client-row");
const sheet = (page: Page) => page.getByRole("dialog");

async function openClients(page: Page, user = "owner") {
  await signInAs(page, user);
  await page.getByRole("navigation", { name: "Dashboard" }).getByRole("link", { name: "Clients" }).click();
  await expect(page.getByRole("heading", { name: "Clients", level: 1 })).toBeVisible();
}

test.describe("clients list", () => {
  test("filters with counts, search by name or a number typed any way, Back returns to the same list", async ({ page }) => {
    await openClients(page);
    const show = page.getByRole("navigation", { name: "Show" });
    await expect(show.getByRole("link", { name: /^All \(\d+\)$/ })).toHaveAttribute("aria-current", "page");

    await show.getByRole("link", { name: /^Due back/ }).click();
    await expect(page).toHaveURL(/filter=due_back/);
    await expect(rows(page)).toHaveText([/SAMPLE Chris Dueback\s*Due back/]);

    await show.getByRole("link", { name: /^Regulars/ }).click();
    await expect(rows(page)).toHaveText([/SAMPLE Alex Regular/]);

    await show.getByRole("link", { name: /^All/ }).click();
    await expect(page).toHaveURL(/\/dashboard\/clients$/);
    await expect(show.getByRole("link", { name: /^All/ })).toHaveAttribute("aria-current", "page");
    await page.getByLabel("Search by name or number").fill("noshow");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page).toHaveURL(/q=noshow/);
    await expect(rows(page)).toHaveText([/SAMPLE Dan Noshow/]);
    await expect(page.getByTestId("client-summary")).toHaveText("Showing 1–1 of 1 for “noshow”");

    await page.getByLabel("Search by name or number").fill("+44 7700 900 003");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(rows(page)).toHaveText([/SAMPLE Chris Dueback/]);

    // Into a client and back again: same search.
    await rows(page).first().click();
    await expect(page.getByRole("heading", { name: "SAMPLE Chris Dueback", level: 1 })).toBeVisible();
    await page.getByRole("link", { name: "Back to clients" }).click();
    await expect(page).toHaveURL(/q=%2B44\+7700\+900\+003|q=\+44/);
    await expect(rows(page)).toHaveText([/SAMPLE Chris Dueback/]);
  });

  test("'Clients of' a barber (owner/admin)", async ({ page }) => {
    await openClients(page);
    await page.getByLabel("Clients of").selectOption({ label: "SAMPLE Jamie" });
    await expect(page).toHaveURL(/barber=[0-9a-f-]{36}/);
    await expect(rows(page)).toHaveText([/SAMPLE Dan Noshow/]);
  });

  test("20 per page with Previous/Next", async ({ page }) => {
    for (let i = 0; i < 21; i++) {
      await client(`+4477009007${String(i + 10).padStart(2, "0")}`, `E2E Page ${String(i + 1).padStart(2, "0")}`);
    }
    await signInAs(page, "owner");
    await page.goto("/dashboard/clients?q=E2E+Page");
    await expect(rows(page)).toHaveCount(20);
    await expect(page.getByTestId("client-summary")).toContainText("Showing 1–20 of 21");
    await page.getByRole("link", { name: "Next" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(rows(page)).toHaveText([/E2E Page 21/]);
    await page.getByRole("link", { name: "Previous" }).click();
    await expect(rows(page)).toHaveCount(20);
  });

  test("barbers: only their own clients; others are 'not found'; no editing", async ({ page }) => {
    await openClients(page, "sam");
    await expect(rows(page)).toHaveText([/SAMPLE Alex Regular/, /SAMPLE Ben New/]);
    await expect(page.getByLabel("Clients of")).toHaveCount(0);
    await page.goto(`/dashboard/clients/${DAN}`);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await page.goto(`/dashboard/clients/${ALEX}`);
    await expect(page.getByRole("heading", { name: "SAMPLE Alex Regular" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit details" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Delete client" })).toHaveCount(0);
    await expect(page.getByTestId("client-stats")).toContainText("Spent with you");
  });
});

test.describe("search form", () => {
  // Dashboard pages stream behind Suspense, which needs JavaScript to show; the search itself is a plain GET form,
  // so results come straight from the address (bookmarkable, shareable between staff phones).
  test("is a plain GET form, and results load straight from the address", async ({ page }) => {
    await signInAs(page, "owner");
    await page.goto("/dashboard/clients?q=dueback");
    const form = page.getByRole("search");
    await expect(form).toHaveAttribute("action", "/dashboard/clients");
    await expect(form).not.toHaveAttribute("method", /post/i);
    await expect(page.getByLabel("Search by name or number")).toHaveValue("dueback");
    await expect(rows(page)).toHaveText([/SAMPLE Chris Dueback/]);
  });
});

test.describe("client page", () => {
  test("stats, usual service and barber; due-back clients get the reminder text ready", async ({ page }) => {
    await signInAs(page, "owner");
    await page.goto(`/dashboard/clients/${ALEX}`);
    const stats = page.getByTestId("client-stats");
    await expect(stats).toContainText("Visits3");
    await expect(stats).toContainText("Usual serviceSkin Fade");
    await expect(stats).toContainText("Usual barberSardar");
    await expect(page.getByRole("link", { name: "WhatsApp", exact: true })).toHaveAttribute("href", "https://wa.me/447700900001");

    await page.goto("/dashboard/clients/20000000-0000-4000-8000-000000000003");
    await expect(page.getByRole("link", { name: "WhatsApp reminder" })).toHaveAttribute("href", /^https:\/\/wa\.me\/447700900003\?text=Hi%20SAMPLE%2C%20it's%20been%20a%20while/);
    await expect(page.getByRole("link", { name: "SMS reminder" })).toHaveAttribute("href", /^sms:\+447700900003\?&body=/);
  });

  test("Book again: usual service and barber, 3 weeks ahead at the usual time, then the confirmation message", async ({ page }) => {
    const date = await londonDay(21);
    try {
      await signInAs(page, "owner");
      await page.goto(`/dashboard/clients/${ALEX}`);
      await page.getByRole("button", { name: "Book again" }).click();
      const form = sheet(page);
      await expect(form).toHaveAccessibleName("Book again: SAMPLE Alex Regular");
      await expect(form.getByLabel("Barber").locator("option:checked")).toHaveText("Sardar");
      await expect(form.getByLabel("Service").locator("option:checked")).toHaveText(/^Skin Fade/);
      await expect(form.getByLabel("Date")).toHaveValue(date);
      await expect(form.getByLabel("Time").locator("option:checked")).toHaveText("10:00am");
      await expect(form.getByLabel("Mobile", { exact: true })).toHaveValue("07700 900001");
      // 07:00 on that day avoids any seeded booking; the warning step is fine.
      await form.getByLabel("Time").selectOption("420");
      await form.getByRole("button", { name: /^Book/ }).click();
      const anyway = form.getByRole("button", { name: "Book anyway" });
      await expect(form.getByTestId("message-preview").or(anyway)).toBeVisible();
      if (await anyway.isVisible()) await anyway.click();
      await expect(form.getByTestId("message-preview")).toContainText("is confirmed");
      await form.getByRole("button", { name: "Not now" }).click();
      await expect(page.getByTestId("client-upcoming")).toContainText("7:00am");
    } finally {
      await sql(
        `delete from public.bookings where client_id = $1 and source = 'staff'
         and starts_at = ($2::date + time '07:00') at time zone 'Europe/London'`,
        [ALEX, date],
      );
    }
  });

  test("Edit details: duplicate numbers refused, values kept; saved changes show", async ({ page }) => {
    const id = await client(CLIENT_A, "E2E Edit Me");
    await signInAs(page, "owner");
    await page.goto(`/dashboard/clients/${id}`);
    await page.getByRole("button", { name: "Edit details" }).click();
    await sheet(page).getByLabel("Name").fill("E2E Edited");
    await sheet(page).getByLabel("Mobile").fill("07700 900001"); // Alex's number
    await sheet(page).getByRole("button", { name: "Save" }).click();
    await expect(formAlert(page)).toHaveText("That number already belongs to another client.");
    await expect(sheet(page).getByLabel("Name")).toHaveValue("E2E Edited");

    await sheet(page).getByLabel("Mobile").fill("07700 900 799");
    await sheet(page).getByRole("button", { name: "Save" }).click();
    await expect(page.getByTestId("toast")).toHaveText("Details saved.");
    await expect(page.getByRole("heading", { name: "E2E Edited", level: 1 })).toBeVisible();
    const [row] = await sql("select name, phone from public.clients where id = $1", [id]);
    expect(row).toEqual({ name: "E2E Edited", phone: "+447700900799" });
  });

  test("Delete client: explains what happens, asks again (focus on Keep), then removes them", async ({ page }) => {
    const id = await client(CLIENT_A, "E2E Delete Me");
    const future = await bookingAt({ clientId: id, days: 4, time: "07:00" });
    await signInAs(page, "owner");
    await page.goto(`/dashboard/clients/${id}`);
    await page.getByRole("button", { name: "Delete client" }).click();
    await expect(sheet(page)).toContainText("Their 1 upcoming booking is cancelled");
    await sheet(page).getByRole("button", { name: "Delete client" }).click();
    await expect(sheet(page).getByRole("button", { name: "Keep" })).toBeFocused();
    await sheet(page).getByRole("group").getByRole("button", { name: "Delete client" }).click();
    await expect(page).toHaveURL(/\/dashboard\/clients\?deleted=1$/);
    await expect(page.getByRole("status").filter({ hasText: "Client deleted." })).toBeVisible();
    expect(await sql("select 1 from public.clients where id = $1", [id])).toEqual([]);
    const [b] = await sql("select status, client_id from public.bookings where id = $1", [future]);
    expect(b).toEqual({ status: "cancelled", client_id: null });
    await sql("delete from public.bookings where id = $1", [future]);
  });
});

test.describe("clients quality", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`WCAG 2.1 AA and no sideways scroll (${theme})`, async ({ page }) => {
      await setTheme(page, "dashboard", theme);
      await signInAs(page, "owner");
      if (page.viewportSize()!.width < 1024) await page.setViewportSize({ width: 320, height: 760 });
      await page.goto("/dashboard/clients");
      await expect(rows(page).first()).toBeVisible();
      await expectNoHorizontalScroll(page);
      await expectAccessible(page);
      await page.goto(`/dashboard/clients/${ALEX}`);
      await expect(page.getByTestId("client-stats")).toBeVisible();
      await expectNoHorizontalScroll(page);
      await expectAccessible(page);
      await page.getByRole("button", { name: "Edit details" }).click();
      await expect(sheet(page)).toBeVisible();
      await expectAccessible(page);
    });
  }
});
