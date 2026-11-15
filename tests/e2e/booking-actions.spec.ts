import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  booking, bookingAt, bookingRow, CLIENT_A, CLIENT_B, CLIENT_C, cleanupDashboardData, client, londonDay, signInAs, skipNearMidnight,
} from "./dashboard-helpers";
import { expectAccessible, sql } from "./helpers";

test.beforeEach(cleanupDashboardData);
test.afterEach(cleanupDashboardData);

const sheet = (page: Page) => page.getByRole("dialog");
const cardFor = (page: Page, name: string) => page.getByTestId("booking-card").filter({ hasText: name }).first();
const openDetails = (card: Locator) => card.getByRole("button").first().click();

/** Clicking the message links runs our handler but never leaves the test page. */
async function tapMessageLink(link: Locator) {
  await link.evaluate((a) => a.addEventListener("click", (e) => e.preventDefault()));
  await link.click();
}

/** Submits a sheet form; confirms "… anyway" if the time has warnings. */
async function submitMaybeAnyway(page: Page, label: RegExp, anyway: string) {
  await sheet(page).getByRole("button", { name: label }).click();
  const confirm = sheet(page).getByRole("button", { name: anyway });
  const answered = sheet(page)
    .getByTestId("message-preview")
    .or(confirm)
    .or(page.getByTestId("toast"))
    .or(sheet(page).getByText("That time overlaps another booking for this barber."));
  await expect(answered.first()).toBeVisible();
  if (await confirm.isVisible()) await confirm.click();
}

test.describe("requests", () => {
  test("Accept on the card → 'Send to customer' with the confirmation text; WhatsApp marks it messaged", async ({ page }) => {
    const a = await client(CLIENT_A, "E2E Ada Lovelace");
    const id = await bookingAt({ clientId: a, days: 1, time: "14:00", status: "pending" });
    await signInAs(page, "owner");

    await page.getByRole("button", { name: /^Accept: E2E Ada Lovelace/ }).click();
    const dialog = sheet(page);
    await expect(dialog).toHaveAccessibleName("Send to customer");
    await expect(dialog).toContainText("Booking accepted.");
    const preview = dialog.getByTestId("message-preview");
    await expect(preview).toContainText("Hi E2E, your booking at Salsa Barber is confirmed.");
    await expect(preview).toContainText("Hair Cut with SAMPLE Jamie");
    await expect(preview).toContainText(/\/booking\/[0-9a-f-]{36}/);
    expect((await bookingRow(id)).status).toBe("confirmed");

    const whatsapp = dialog.getByRole("link", { name: "WhatsApp" });
    await expect(whatsapp).toHaveAttribute("href", /^https:\/\/wa\.me\/447700900701\?text=Hi%20E2E/);
    await expect(dialog.getByRole("link", { name: "SMS" })).toHaveAttribute("href", /^sms:\+447700900701\?&body=Hi%20E2E/);
    await tapMessageLink(whatsapp);
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("toast")).toHaveText("Marked as messaged.");
    await expect.poll(async () => (await bookingRow(id)).message_sent_at).not.toBeNull();

    const [audit] = await sql("select action, actor_name from public.audit_log where entity_id = $1", [id]);
    expect(audit).toEqual({ action: "booking.accept", actor_name: "Hewr" });
  });

  test("a stale screen changes nothing: Accept after someone else declined", async ({ page }) => {
    const a = await client(CLIENT_A, "E2E Ada");
    const id = await bookingAt({ clientId: a, days: 1, time: "14:00", status: "pending" });
    await signInAs(page, "owner");
    await openDetails(cardFor(page, "E2E Ada"));
    await sql("update public.bookings set status = 'declined' where id = $1", [id]);
    await sheet(page).getByRole("button", { name: "Accept" }).click();
    await expect(sheet(page).getByRole("alert")).toContainText("has just been changed");
    expect((await bookingRow(id)).status).toBe("declined");
  });

  test("Decline with a reason: the message includes it", async ({ page }) => {
    const a = await client(CLIENT_A, "E2E Ada");
    const id = await bookingAt({ clientId: a, days: 1, time: "14:00", status: "pending" });
    await signInAs(page, "owner");
    await openDetails(cardFor(page, "E2E Ada"));
    await sheet(page).getByRole("button", { name: "Decline" }).click();
    await expect(sheet(page)).toHaveAccessibleName("Decline request");
    await sheet(page).getByLabel("Reason (optional)").fill("We're fully booked that afternoon.");
    await sheet(page).getByRole("button", { name: "Decline request" }).click();
    await expect(sheet(page).getByTestId("message-preview")).toContainText("We're fully booked that afternoon.");
    await sheet(page).getByRole("button", { name: "Not now" }).click();
    expect(await bookingRow(id)).toMatchObject({ status: "declined", decline_reason: "We're fully booked that afternoon.", message_sent_at: null });
  });
});

test.describe("confirmed bookings", () => {
  test("Done on the card, Undo in the sheet, No-show behind 'Are you sure?' (focus starts on Keep)", async ({ page }) => {
    skipNearMidnight();
    const a = await client(CLIENT_A, "E2E Ada");
    const id = await booking({ clientId: a, startMin: -10 });
    await signInAs(page, "owner");

    await page.getByRole("button", { name: /^Done: E2E Ada/ }).first().click();
    await expect(page.getByTestId("toast")).toHaveText("Marked as done.");
    expect((await bookingRow(id)).status).toBe("completed");

    const scheduled = page.getByTestId("schedule").getByTestId("booking-card").filter({ hasText: "E2E Ada" });
    await expect(scheduled).toHaveAttribute("data-status", "completed");
    await openDetails(scheduled);
    await sheet(page).getByRole("button", { name: "Undo (Done)" }).click();
    await expect(page.getByTestId("toast")).toHaveText("Back to confirmed.");
    expect((await bookingRow(id)).status).toBe("confirmed");

    await expect(scheduled).toHaveAttribute("data-status", "confirmed");
    await openDetails(scheduled);
    await sheet(page).getByRole("button", { name: "No-show" }).click();
    await expect(sheet(page).getByRole("button", { name: "Keep" })).toBeFocused();
    await sheet(page).getByRole("button", { name: "Keep" }).click();
    expect((await bookingRow(id)).status).toBe("confirmed");
    await sheet(page).getByRole("button", { name: "No-show" }).click();
    await sheet(page).getByRole("button", { name: "Mark no-show" }).click();
    await expect(page.getByTestId("toast")).toHaveText("Marked as a no-show.");
    expect((await bookingRow(id)).status).toBe("no_show");
  });

  test("Cancel → cancellation message; the 'message sent' flag is reset", async ({ page }) => {
    const a = await client(CLIENT_A, "E2E Ada");
    const id = await bookingAt({ clientId: a, days: 1, time: "14:00" });
    await sql("update public.bookings set message_sent_at = now() where id = $1", [id]);
    await signInAs(page, "owner");
    await page.goto(`/dashboard/calendar?date=${await londonDay(1)}`);
    await openDetails(cardFor(page, "E2E Ada"));
    await sheet(page).getByRole("button", { name: "Cancel booking" }).click();
    await sheet(page).getByRole("group", { name: "Cancel this booking?" }).getByRole("button", { name: "Cancel booking" }).click();
    await expect(sheet(page).getByTestId("message-preview")).toContainText("has been cancelled");
    expect(await bookingRow(id)).toMatchObject({ status: "cancelled", message_sent_at: null });
  });

  test("Reschedule: warnings first ('Move anyway'), then the 'changed' message; overlaps are refused", async ({ page }) => {
    const a = await client(CLIENT_A, "E2E Ada");
    const b = await client(CLIENT_B, "E2E Bo");
    const id = await bookingAt({ clientId: a, days: 1, time: "14:00" });
    await bookingAt({ clientId: b, days: 1, time: "16:00" });
    const tomorrow = await londonDay(1);
    await signInAs(page, "owner");
    await page.goto(`/dashboard/calendar?date=${tomorrow}`);

    await openDetails(cardFor(page, "E2E Ada"));
    await sheet(page).getByRole("button", { name: "Reschedule" }).click();
    // 6:00am is before every opening time: a warning, not a block.
    await sheet(page).getByLabel("Time").selectOption("360");
    await sheet(page).getByRole("button", { name: "Move", exact: true }).click();
    await expect(sheet(page).getByRole("alert")).toContainText("outside opening hours");
    await expect(sheet(page).getByRole("button", { name: "Move anyway" })).toBeVisible();
    // Changing the time asks again.
    await sheet(page).getByLabel("Time").selectOption("365");
    await expect(sheet(page).getByRole("button", { name: "Move", exact: true })).toBeVisible();
    await sheet(page).getByRole("button", { name: "Move", exact: true }).click();
    await sheet(page).getByRole("button", { name: "Move anyway" }).click();
    await expect(sheet(page).getByTestId("message-preview")).toContainText("New time:");
    await expect(sheet(page).getByTestId("message-preview")).toContainText("6:05am (was");
    await sheet(page).getByRole("button", { name: "Not now" }).click();
    const [{ hhmm }] = await sql("select to_char(starts_at at time zone 'Europe/London', 'HH24:MI') as hhmm from public.bookings where id = $1", [id]);
    expect(hhmm).toBe("06:05");
    const [audit] = await sql("select action, summary from public.audit_log where entity_id = $1", [id]);
    expect(audit.action).toBe("booking.reschedule");

    // Onto E2E Bo's time: refused.
    await openDetails(cardFor(page, "E2E Ada"));
    await sheet(page).getByRole("button", { name: "Reschedule" }).click();
    await sheet(page).getByLabel("Time").selectOption("960");
    await submitMaybeAnyway(page, /^Move$/, "Move anyway");
    await expect(sheet(page).getByRole("alert").last()).toHaveText("That time overlaps another booking for this barber.");
  });

  test("owner changes the barber, then the service and price", async ({ page }) => {
    const a = await client(CLIENT_A, "E2E Ada");
    const id = await bookingAt({ clientId: a, days: 2, time: "07:00" });
    await signInAs(page, "owner");
    await page.goto(`/dashboard/calendar?date=${await londonDay(2)}`);

    await openDetails(cardFor(page, "E2E Ada"));
    await sheet(page).getByRole("button", { name: "Change barber" }).click();
    await sheet(page).getByLabel("New barber").selectOption({ label: "Sardar" });
    await submitMaybeAnyway(page, /^Save$/, "Save anyway");
    await expect(sheet(page).getByTestId("message-preview")).toContainText("Now with Sardar (was SAMPLE Jamie)");
    await sheet(page).getByRole("button", { name: "Not now" }).click();
    expect((await bookingRow(id)).barber).toBe("sam");

    await openDetails(cardFor(page, "E2E Ada"));
    await sheet(page).getByRole("button", { name: "Change service or price" }).click();
    await sheet(page).getByLabel("Service").selectOption({ label: "Skin Fade · £18 · 45 min" });
    await expect(sheet(page).getByLabel("Price (£)")).toHaveValue("18");
    await sheet(page).getByLabel("Price (£)").fill("20");
    await sheet(page).getByRole("button", { name: "Save" }).click();
    await expect(sheet(page).getByTestId("message-preview")).toContainText("Service: Skin Fade, £20 (was Hair Cut, £17)");
    expect(await bookingRow(id)).toMatchObject({ service_name: "Skin Fade", price_pence: 2000 });
  });

  test("barbers: own bookings only, no barber/service changes", async ({ page }) => {
    const a = await client(CLIENT_A, "E2E Ada");
    await bookingAt({ clientId: a, days: 1, time: "14:00", barber: "sam" });
    await signInAs(page, "sam");
    await page.goto(`/dashboard/calendar?date=${await londonDay(1)}`);
    await openDetails(cardFor(page, "E2E Ada"));
    const actions = sheet(page).getByTestId("booking-actions");
    await expect(actions.getByRole("button", { name: "Reschedule" })).toBeVisible();
    await expect(actions.getByRole("button", { name: "Change barber" })).toHaveCount(0);
    await expect(actions.getByRole("button", { name: "Change service or price" })).toHaveCount(0);
  });
});

test.describe("walk-ins and phone bookings", () => {
  test("anonymous walk-in for a barber, shown as 'Walk-in customer'", async ({ page }) => {
    skipNearMidnight();
    await signInAs(page, "owner");
    await page.getByRole("button", { name: "Walk-in", exact: true }).click();
    await expect(sheet(page)).toHaveAccessibleName("Add a walk-in");
    await sheet(page).getByLabel("Barber").selectOption({ label: "SAMPLE Jamie" });
    await submitMaybeAnyway(page, /^Add walk-in$/, "Save anyway");
    await expect(page.getByTestId("toast")).toHaveText("Walk-in added.");
    const rows = await sql(
      "select b.source, b.status, b.client_id from public.bookings b join public.staff s on s.id = b.staff_id where s.username = 'jamie' and b.created_at > now() - interval '1 minute'",
    );
    expect(rows).toEqual([{ source: "walk_in", status: "confirmed", client_id: null }]);
    await expect(page.getByTestId("schedule").getByTestId("booking-card").filter({ hasText: "Walk-in customer" }).filter({ hasText: "SAMPLE Jamie" })).toHaveCount(1);
  });

  test("a walk-in's name needs a mobile; a barber can only add their own", async ({ page }) => {
    await signInAs(page, "sam");
    await page.getByRole("button", { name: "Walk-in", exact: true }).click();
    await expect(sheet(page).getByLabel("Barber")).toHaveCount(0);
    await sheet(page).getByLabel("Name (optional)").fill("Jo");
    await sheet(page).getByRole("button", { name: /^(Add walk-in|Save anyway)$/ }).click();
    await expect(sheet(page).getByText("Add their mobile number too")).toBeVisible();
    await expect(sheet(page).getByLabel("Name (optional)")).toHaveValue("Jo");
  });

  test("phone booking: name and mobile required; finds or adds the client; confirmation message", async ({ page }) => {
    await signInAs(page, "owner");
    await page.getByRole("button", { name: "Booking", exact: true }).click();
    await expect(sheet(page)).toHaveAccessibleName("New booking");
    const day = await londonDay(3);
    await sheet(page).getByLabel("Date").fill(day);
    await sheet(page).getByLabel("Time").selectOption("420");
    await sheet(page).getByRole("button", { name: /^(Book|Book anyway)$/ }).click();
    await expect(sheet(page).getByText("Please enter the customer's name.")).toBeVisible();

    await sheet(page).getByLabel("Name", { exact: true }).fill("E2E Cara Phone");
    await sheet(page).getByLabel("Mobile", { exact: true }).fill("0770 090 0703");
    await submitMaybeAnyway(page, /^Book$/, "Book anyway");
    await expect(sheet(page).getByTestId("message-preview")).toContainText("Hi E2E, your booking at Salsa Barber is confirmed.");
    await sheet(page).getByRole("button", { name: "Not now" }).click();
    const [row] = await sql(
      `select b.source, b.status, c.name from public.bookings b join public.clients c on c.id = b.client_id where c.phone = $1`,
      [CLIENT_C],
    );
    expect(row).toEqual({ source: "staff", status: "confirmed", name: "E2E Cara Phone" });
  });

  test("sheets pass WCAG 2.1 AA (walk-in form, reschedule with warnings)", async ({ page }) => {
    const a = await client(CLIENT_A, "E2E Ada");
    await bookingAt({ clientId: a, days: 1, time: "14:00" });
    await signInAs(page, "owner");
    await page.getByRole("button", { name: "Walk-in", exact: true }).click();
    await expect(sheet(page).getByTestId("new-booking-form")).toBeVisible();
    await expectAccessible(page);
    await page.keyboard.press("Escape");
    await page.goto(`/dashboard/calendar?date=${await londonDay(1)}`);
    await openDetails(cardFor(page, "E2E Ada"));
    await sheet(page).getByRole("button", { name: "Reschedule" }).click();
    await sheet(page).getByLabel("Time").selectOption("360");
    await sheet(page).getByRole("button", { name: "Move", exact: true }).click();
    await expect(sheet(page).getByRole("button", { name: "Move anyway" })).toBeVisible();
    await expectAccessible(page);
  });
});
