import { expect, test, type Page } from "@playwright/test";
import { expectAccessible, expectNoHorizontalScroll, setTheme, sql } from "./helpers";

/** The customer's private page. Test phones: 07700 9008xx (Ofcom drama range). */
const PHONE = "+447700900801";
const PHONE_LIKE = "+4477009008%";

test.afterEach(async () => {
  await sql(`delete from public.bookings where client_id in (select id from public.clients where phone like '${PHONE_LIKE}')`);
  await sql(`delete from public.clients where phone like '${PHONE_LIKE}'`);
  await sql("delete from public.request_attempts");
});

/** A pending online Hair Cut with Jamie, `minutes` from now, or `days` ahead at 10:00 London. */
async function customerBooking(when: { days: number } | { minutes: number }): Promise<{ id: string; token: string }> {
  const [c] = await sql(
    "insert into public.clients (name, phone) values ('E2E Manage', $1) on conflict (phone) do update set name = excluded.name returning id",
    [PHONE],
  );
  const start =
    "days" in when
      ? `(((now() at time zone 'Europe/London')::date + ${when.days}) + time '10:00') at time zone 'Europe/London'`
      : `date_trunc('minute', now()) + make_interval(mins => ${when.minutes})`;
  const [b] = await sql(
    `insert into public.bookings (client_id, staff_id, service_id, service_name, price_pence, duration_min, starts_at, ends_at, status, source)
     select $1, st.id, sv.id, sv.name, sv.price_pence, sv.duration_min, ${start}, ${start}, 'pending', 'online'
     from public.staff st, public.services sv where st.username = 'jamie' and sv.name = 'Hair Cut'
     returning id, manage_token`,
    [c.id],
  );
  return { id: b.id, token: b.manage_token };
}

const status = (page: Page) => page.getByTestId("booking-status");

test.describe("customer's private page", () => {
  test("cancel asks first, then cancels (marked as by the customer); Change and Cancel disappear", async ({ page }) => {
    const b = await customerBooking({ days: 3 });
    await page.goto(`/booking/${b.token}`);
    await expect(status(page)).toContainText("Request sent");
    await page.getByRole("button", { name: "Cancel booking" }).click();
    await expect(page.getByRole("button", { name: "Keep booking" })).toBeFocused();
    await page.getByRole("button", { name: "Keep booking" }).click();
    await expect(page.getByRole("button", { name: "Yes, cancel it" })).toHaveCount(0);

    await page.getByRole("button", { name: "Cancel booking" }).click();
    await page.getByRole("button", { name: "Yes, cancel it" }).click();
    await expect(status(page)).toContainText("Booking cancelled");
    await expect(page.getByRole("link", { name: "Change" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Cancel booking" })).toHaveCount(0);
    const [row] = await sql("select status, cancelled_by_client from public.bookings where id = $1", [b.id]);
    expect(row).toEqual({ status: "cancelled", cancelled_by_client: true });
  });

  test("change: service and barber filled in, nothing to retype; one link; the shop sees a new request", async ({ page }) => {
    const b = await customerBooking({ days: 3 });
    await page.goto(`/booking/${b.token}`);
    await page.getByRole("link", { name: "Change" }).click();
    await expect(page).toHaveURL(/\/book\?.*change=/);
    await expect(page.getByText(/^Changing your booking\./)).toBeVisible();
    await expect(page.getByTestId("step-heading")).toHaveText("Pick a day and time");
    await page.getByTestId("times").getByRole("button").first().click();
    await expect(page.getByTestId("step-heading")).toHaveText("Your details");
    await expect(page.getByLabel("Name")).toHaveValue("E2E Manage");
    await expect(page.getByLabel("Mobile number")).toHaveValue("07700 900801");
    await page.getByRole("button", { name: "Send change request" }).click();

    await expect(page).toHaveURL(new RegExp(`/booking/${b.token}$`));
    await expect(status(page)).toContainText("Request sent");
    const rows = await sql(
      "select id, status, manage_token, changed_from, cancelled_by_client from public.bookings where id = $1 or changed_from = $1 order by created_at",
      [b.id],
    );
    expect(rows).toHaveLength(2);
    const [old, fresh] = rows;
    expect(old).toMatchObject({ status: "cancelled", cancelled_by_client: true });
    expect(old.manage_token).not.toBe(b.token);
    expect(fresh).toMatchObject({ status: "pending", manage_token: b.token, changed_from: b.id });
  });

  test("too close to the appointment: no Change or Cancel, a message to call instead; the change page refuses", async ({ page }) => {
    const [{ cutoff }] = await sql("select change_cutoff_minutes as cutoff from public.settings");
    test.skip(cutoff < 30, "Needs a change/cancel cut-off of at least 30 minutes.");
    const b = await customerBooking({ minutes: 15 });
    await page.goto(`/booking/${b.token}`);
    await expect(page.getByTestId("too-late")).toContainText("can't be changed or cancelled online");
    await expect(page.getByRole("link", { name: "Change" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Cancel booking" })).toHaveCount(0);
    await page.goto(`/book?change=${b.token}`);
    await expect(page.getByTestId("change-refused")).toBeVisible();
  });

  test("book another: name and number filled in, 'Who is this for?'; a different name is kept on that booking only", async ({ page }) => {
    const b = await customerBooking({ days: 4 });
    await page.goto(`/booking/${b.token}`);
    await page.getByRole("link", { name: "Book another" }).click();
    await expect(page).toHaveURL(/\/book\?for=/);
    await page.getByRole("button", { name: /^Skin Fade(\s|$)/ }).click();
    await page.getByRole("button", { name: /Any barber/ }).click();
    await page.getByTestId("times").getByRole("button").first().click();
    await expect(page.getByLabel("Who is this for?")).toHaveValue("E2E Manage");
    await expect(page.getByLabel("Mobile number")).toHaveValue("07700 900801");
    await page.getByLabel("Who is this for?").fill("E2E Junior");
    await page.getByRole("button", { name: "Send booking request" }).click();
    await expect(page).toHaveURL(/\/booking\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("main")).toContainText("E2E Junior");
    const token = page.url().split("/").pop();
    const [row] = await sql(
      "select b.booked_name, c.name from public.bookings b join public.clients c on c.id = b.client_id where b.manage_token = $1",
      [token],
    );
    expect(row).toEqual({ booked_name: "E2E Junior", name: "E2E Manage" });
  });

  test("WhatsApp the shop has the booking prefilled; Copy link copies this page", async ({ page, context, browserName }) => {
    const b = await customerBooking({ days: 3 });
    await page.goto(`/booking/${b.token}`);
    const href = await page.getByRole("link", { name: "WhatsApp the shop" }).getAttribute("href");
    const text = new URL(href!).searchParams.get("text")!;
    expect(text).toMatch(/^Hi .+, I'd like to change my booking:\nHair Cut with SAMPLE Jamie, /);
    expect(text).toContain(`/booking/${b.token}`);
    expect(text).not.toContain("07700");

    if (browserName === "chromium") await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.getByRole("button", { name: "Copy link" }).click();
    await expect(page.getByRole("button", { name: "Link copied" })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(page.url());
  });

  for (const theme of ["light", "dark"] as const) {
    test(`WCAG 2.1 AA and no sideways scroll (${theme})`, async ({ page }) => {
      const b = await customerBooking({ days: 3 });
      await setTheme(page, "site", theme);
      await page.goto(`/booking/${b.token}`);
      if (page.viewportSize()!.width < 1024) await page.setViewportSize({ width: 320, height: 760 });
      await page.getByRole("button", { name: "Cancel booking" }).click();
      await expectNoHorizontalScroll(page);
      await expectAccessible(page);
    });
  }
});
