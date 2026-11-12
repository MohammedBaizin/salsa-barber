import { expect, test, type Page } from "@playwright/test";
import { formatTime } from "../../src/lib/domain/time";
import { expectAccessible, expectNoHorizontalScroll, formAlert, setTheme, sql } from "./helpers";

/** Test phones: 07700 9006xx (Ofcom drama range). */
const PHONE_LIKE = "+4477009006%";

test.afterEach(async () => {
  await sql(`delete from public.bookings where client_id in (select id from public.clients where phone like '${PHONE_LIKE}')`);
  await sql(`delete from public.clients where phone like '${PHONE_LIKE}'`);
  await sql("delete from public.request_attempts");
});

const heading = (page: Page) => page.getByTestId("step-heading");

async function chooseService(page: Page, name: string) {
  // The name, then a space or the end (a word boundary doesn't work after ")").
  await page.getByRole("button", { name: new RegExp(`^${name.replace(/[()]/g, "\\$&")}(\\s|$)`) }).click();
}

/** Picks the first day with free times and its first time; returns the ISO start (from the API) and the label. */
async function chooseFirstTime(page: Page) {
  await expect(page.getByTestId("times")).toBeVisible();
  const button = page.getByTestId("times").getByRole("button").first();
  const label = (await button.textContent())!.trim();
  await button.click();
  await expect(heading(page)).toHaveText("Your details");
  return label;
}

async function fillDetails(page: Page, name: string, phone: string) {
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Mobile number").fill(phone);
}

test.describe("booking flow", () => {
  test("full journey: service → any barber → time → details → private page, saved as a pending request", async ({ page }) => {
    await page.goto("/book");
    await expect(heading(page)).toHaveText("Choose a service");
    await chooseService(page, "Hair Cut");
    await expect(heading(page)).toHaveText("Choose a barber");
    await expect(heading(page)).toBeFocused();
    await page.getByRole("button", { name: /Any barber/ }).click();
    await expect(heading(page)).toHaveText("Pick a day and time");
    const label = await chooseFirstTime(page);
    await expect(page.getByRole("complementary", { name: "Your booking" })).toContainText(label);

    await fillDetails(page, "  E2E   Customer ", "07700 900601");
    await page.getByRole("button", { name: "Send booking request" }).click();
    await expect(page).toHaveURL(/\/booking\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId("booking-status")).toContainText("Request sent");
    await expect(page.getByTestId("booking-status")).toContainText("not confirmed");
    await expect(page.getByRole("main")).toContainText("Hair Cut · £17");
    await expect(page.getByRole("main")).toContainText("07700 900601");
    await expect(page.getByRole("main")).toContainText(label);

    const token = page.url().split("/").pop();
    const [row] = await sql(
      `select b.status, b.source, b.any_barber, b.service_name, c.name, c.phone from public.bookings b
       join public.clients c on c.id = b.client_id where b.manage_token = $1`,
      [token],
    );
    expect(row).toEqual({ status: "pending", source: "online", any_barber: true, service_name: "Hair Cut", name: "E2E Customer", phone: "+447700900601" });
  });

  test("deep links: a homepage price row starts at the barber step; 'Book with' a barber skips it", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /^Skin Fade\s*£18/ }).click();
    await expect(page).toHaveURL(/\/book\?service=/);
    await expect(heading(page)).toHaveText("Choose a barber");

    await page.goto("/");
    await page.getByRole("link", { name: "Book with SAMPLE Sam" }).click();
    await expect(heading(page)).toHaveText("Choose a service");
    await chooseService(page, "Hair Cut");
    await expect(heading(page)).toHaveText("Pick a day and time");
    const switcher = page.getByRole("combobox", { name: "Barber" });
    await expect(switcher).toHaveValue(/[0-9a-f-]{36}/);
    await expect(switcher.locator("option:checked")).toHaveText("SAMPLE Sam");
  });

  test("the phone's Back button walks back through the steps and keeps choices", async ({ page }) => {
    await page.goto("/book");
    await chooseService(page, "Hair Cut");
    await page.getByRole("button", { name: /SAMPLE Owner/ }).click();
    const label = await chooseFirstTime(page);
    await page.goBack();
    await expect(heading(page)).toHaveText("Pick a day and time");
    await expect(page.getByTestId("times").getByRole("button", { name: label, exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.goBack();
    await expect(heading(page)).toHaveText("Choose a barber");
    await expect(page.getByRole("button", { name: /SAMPLE Owner/ })).toHaveAttribute("aria-pressed", "true");
    await page.goBack();
    await expect(heading(page)).toHaveText("Choose a service");
    await page.goForward();
    await expect(heading(page)).toHaveText("Choose a barber");
  });

  test("summary Change links jump back to a step", async ({ page }) => {
    await page.goto("/book");
    await chooseService(page, "Hair Cut");
    await page.getByRole("button", { name: /Any barber/ }).click();
    await chooseFirstTime(page);
    await page.getByRole("button", { name: "Change service" }).click();
    await expect(heading(page)).toHaveText("Choose a service");
    await chooseService(page, "Skin Fade");
    await expect(heading(page)).toHaveText("Pick a day and time"); // barber choice kept
  });

  test("a wrong number shows the spec's message and keeps what was typed", async ({ page }) => {
    await page.goto("/book");
    await chooseService(page, "Hair Cut");
    await page.getByRole("button", { name: /Any barber/ }).click();
    await chooseFirstTime(page);
    await fillDetails(page, "E2E Landline", "0151 309 4681");
    await page.getByRole("button", { name: "Send booking request" }).click();
    await expect(page.getByText("Please enter a UK mobile number, e.g. 07123 456789")).toBeVisible();
    await expect(page.getByLabel("Your name")).toHaveValue("E2E Landline");
    await expect(page.getByLabel("Mobile number")).toHaveValue("0151 309 4681");
  });

  test("slot taken mid-flow: friendly message, fresh times, name and number kept", async ({ page }) => {
    await page.goto("/book");
    await chooseService(page, "Hair Cut");
    await page.getByRole("button", { name: /SAMPLE Sam/ }).click();
    await chooseFirstTime(page);
    const start = new URL(page.url()).searchParams; // step=details
    expect(start.get("step")).toBe("details");
    const iso = await page.locator('input[name="start"]').inputValue();

    // Someone else takes that exact time with Sam.
    await sql(
      `insert into public.bookings (client_id, staff_id, service_id, service_name, price_pence, duration_min, starts_at, ends_at, status, source)
       select (select id from public.clients where phone = '+447700900003'), s.id, v.id, v.name, v.price_pence, v.duration_min, $1, $1, 'confirmed', 'staff'
       from public.staff s, public.services v where s.username = 'sam' and v.name = 'Hair Cut'`,
      [iso],
    );
    try {
      await fillDetails(page, "E2E Late", "07700 900602");
      await page.getByRole("button", { name: "Send booking request" }).click();
      await expect(page.getByRole("alert").filter({ hasText: "someone has just taken that time" })).toBeVisible();
      await expect(heading(page)).toHaveText("Pick a day and time");
      await expect(page.getByTestId("times").getByRole("button", { name: formatTime(new Date(iso)), exact: true })).toHaveCount(0);
      await page.getByTestId("times").getByRole("button").first().click();
      await expect(page.getByLabel("Your name")).toHaveValue("E2E Late");
      await expect(page.getByLabel("Mobile number")).toHaveValue("07700 900602");
    } finally {
      await sql("delete from public.bookings where starts_at = $1 and source = 'staff' and staff_id = (select id from public.staff where username = 'sam')", [iso]);
    }
  });

  test("double tapping Send creates one booking", async ({ page }) => {
    await page.goto("/book");
    await chooseService(page, "Hair Cut");
    await page.getByRole("button", { name: /Any barber/ }).click();
    await chooseFirstTime(page);
    await fillDetails(page, "E2E Double", "07700 900603");
    await page.getByRole("button", { name: "Send booking request" }).dblclick();
    await expect(page).toHaveURL(/\/booking\//);
    const [{ n }] = await sql("select count(*)::int n from public.bookings b join public.clients c on c.id = b.client_id where c.phone = '+447700900603'");
    expect(n).toBe(1);
  });

  test("a filled honeypot is refused without a booking", async ({ page }) => {
    await page.goto("/book");
    await chooseService(page, "Hair Cut");
    await page.getByRole("button", { name: /Any barber/ }).click();
    await chooseFirstTime(page);
    await fillDetails(page, "E2E Bot", "07700 900604");
    await page.locator('input[name="website"]').evaluate((el: HTMLInputElement) => (el.value = "spam.example"));
    await page.getByRole("button", { name: "Send booking request" }).click();
    await expect(formAlert(page)).toHaveText(/Something went wrong/);
    expect(await sql("select 1 from public.clients where phone = '+447700900604'")).toEqual([]);
  });

  test("OAP Cut can't be booked on Fridays, Saturdays or Sundays", async ({ page }) => {
    await page.goto("/book");
    await chooseService(page, "OAP Cut (Mon–Thurs)");
    await page.getByRole("button", { name: /Any barber/ }).click();
    await expect(page.getByTestId("day-strip")).toBeVisible();
    for (const day of ["Fri", "Sat", "Sun"]) {
      const buttons = page.getByTestId("day-strip").getByRole("button", { name: new RegExp(`^${day}`) });
      for (const b of await buttons.all()) await expect(b).toBeDisabled();
    }
  });
});

test.describe("time zones", () => {
  test.use({ timezoneId: "Asia/Tokyo" });

  test("times are shown in London time on a device in another time zone", async ({ page, request }) => {
    const [{ id }] = await sql("select id from public.services where name = 'Hair Cut'");
    const api = await (await request.get(`/api/availability?service=${id}`)).json();
    const first = api.days.find((d: { times: string[] }) => d.times.length > 0).times[0];
    await page.goto(`/book?service=${id}&barber=any`);
    await expect(page.getByTestId("times").getByRole("button").first()).toHaveText(formatTime(new Date(first)));
  });
});

test.describe("availability API", () => {
  test("returns start times only, 404 for unknown services, 400 for bad input", async ({ request }) => {
    const [{ id }] = await sql("select id from public.services where name = 'Hair Cut'");
    const res = await request.get(`/api/availability?service=${id}`);
    expect(res.status()).toBe(200);
    expect(res.headers()["cache-control"]).toBe("no-store");
    const body = await res.json();
    expect(Object.keys(body)).toEqual(["days"]);
    for (const d of body.days) {
      expect(Object.keys(d).sort()).toEqual(["date", "times"]);
      for (const t of d.times) expect(t).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/);
    }
    expect(JSON.stringify(body)).not.toMatch(/SAMPLE|\+44|name|phone/i);
    expect((await request.get("/api/availability?service=6f1c2b8e-9d3a-4c5b-8e7f-1a2b3c4d5e6f")).status()).toBe(404);
    expect((await request.get("/api/availability?service=nope")).status()).toBe(400);
  });
});

test.describe("customer's private page", () => {
  test("unknown or malformed tokens show 'not found' and the page is never indexed", async ({ page }) => {
    // notFound() runs inside the streamed Suspense boundary, so the status is already sent; the content is the 404 page.
    for (const path of ["/booking/6f1c2b8e-9d3a-4c5b-8e7f-1a2b3c4d5e6f", "/booking/not-a-token"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
      await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);
    }
  });
});

test.describe("booking accessibility", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`every step passes WCAG 2.1 AA (${theme})`, async ({ page }) => {
      await setTheme(page, "site", theme);
      await page.goto("/book");
      await expectAccessible(page);
      await chooseService(page, "Hair Cut");
      await expectAccessible(page);
      await page.getByRole("button", { name: /Any barber/ }).click();
      await expect(page.getByTestId("times")).toBeVisible();
      await expectAccessible(page);
      await chooseFirstTime(page);
      await expectAccessible(page);
      await page.getByRole("button", { name: "Send booking request" }).click();
      await expect(page.getByText("Please enter your name.")).toBeVisible();
      await expectAccessible(page);
    });
  }

  test("no sideways scroll on the time step at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto("/book");
    await chooseService(page, "Hair Cut");
    await page.getByRole("button", { name: /Any barber/ }).click();
    await expect(page.getByTestId("times")).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});
