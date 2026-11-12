import { describe, expect, it } from "vitest";
import {
  barberColumns, bookingCountLabel, calendarHref, countByDay, groupByDay, parseCalendarParams, visibleStatuses, weekOf,
} from "@/lib/domain/calendar";
import { PHONE_ERROR } from "@/lib/domain/phone";
import {
  bookingMessage, changeServiceSchema, newBookingSchema, NOT_ALLOWED_ERROR, planForBooking, planForStatus, rescheduleSchema,
  STALE_ERROR, staffErrorMessage, statusActionSchema,
} from "@/lib/domain/staff-bookings";
import { fromLondon } from "@/lib/domain/time";
import { OVERLAP_ERROR } from "@/lib/domain/validation";

const TODAY = "2026-11-12"; // a Thursday
const ID = "10000000-0000-4000-8000-000000000003";
const at = (day: string, hhmm: string) => fromLondon(day, Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)));

describe("calendar URL state", () => {
  it("defaults to today, Day view, everyone, live bookings only", () => {
    expect(parseCalendarParams({}, TODAY)).toEqual({ view: "day", date: TODAY, barber: null, all: false });
    expect(calendarHref(parseCalendarParams({}, TODAY), TODAY)).toBe("/dashboard/calendar");
  });

  it("round-trips every choice", () => {
    const p = parseCalendarParams({ date: "2026-12-01", barber: ID, all: "1" }, TODAY);
    expect(p).toEqual({ view: "day", date: "2026-12-01", barber: ID, all: true });
    expect(calendarHref(p, TODAY)).toBe(`/dashboard/calendar?date=2026-12-01&barber=${ID}&all=1`);
    const up = parseCalendarParams({ view: "upcoming" }, TODAY);
    expect(calendarHref(up, TODAY)).toBe("/dashboard/calendar?view=upcoming");
  });

  it("ignores rubbish (bad dates, non-uuid barbers, arrays)", () => {
    expect(parseCalendarParams({ date: "2026-02-30", barber: "1 or 1=1", view: "month" }, TODAY)).toEqual({
      view: "day", date: TODAY, barber: null, all: false,
    });
    expect(parseCalendarParams({ date: ["2026-12-01", "x"] }, TODAY).date).toBe("2026-12-01");
  });
});

describe("week strip", () => {
  it("Monday to Sunday around the selected day, across months and years", () => {
    expect(weekOf(TODAY)).toEqual(["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"]);
    expect(weekOf("2026-11-09")[0]).toBe("2026-11-09");
    expect(weekOf("2026-11-15")[0]).toBe("2026-11-09");
    expect(weekOf("2027-01-01")).toEqual(["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03"]);
  });

  it("counts per London day, cancelled/declined only with the switch on", () => {
    const rows = [
      { startsAt: at(TODAY, "09:00"), status: "confirmed" as const },
      { startsAt: at(TODAY, "10:00"), status: "cancelled" as const },
      { startsAt: at("2026-11-13", "00:30"), status: "pending" as const },
      { startsAt: at("2026-11-13", "23:30"), status: "declined" as const },
    ];
    expect(Object.fromEntries(countByDay(rows, false))).toEqual({ [TODAY]: 1, "2026-11-13": 1 });
    expect(Object.fromEntries(countByDay(rows, true))).toEqual({ [TODAY]: 2, "2026-11-13": 2 });
    expect(visibleStatuses(false)).not.toContain("cancelled");
  });

  it("count labels", () => {
    expect([0, 1, 4].map(bookingCountLabel)).toEqual(["No bookings", "1 booking", "4 bookings"]);
  });
});

describe("upcoming and columns", () => {
  it("groups by London day in time order", () => {
    const rows = [
      { id: "c", startsAt: at("2026-11-14", "10:00") },
      { id: "a", startsAt: at(TODAY, "16:00") },
      { id: "b", startsAt: at(TODAY, "09:00") },
    ];
    expect(groupByDay(rows).map((g) => [g.day, g.bookings.map((b) => b.id)])).toEqual([
      [TODAY, ["b", "a"]],
      ["2026-11-14", ["c"]],
    ]);
  });

  it("a column per bookable barber, plus anyone else with a booking", () => {
    const cols = barberColumns(
      [{ id: "own", name: "Owner" }, { id: "sam", name: "Sam" }],
      [{ staffId: "sam", staffName: "Sam" }, { staffId: "old", staffName: "Former" }],
    );
    expect(cols.map((c) => c.id)).toEqual(["own", "sam", "old"]);
  });
});

describe("staff action inputs", () => {
  it("decline reason: optional, whitespace tidied, at most 200 characters", () => {
    expect(statusActionSchema.parse({ id: ID, action: "decline", reason: "  Fully   booked " }).reason).toBe("Fully booked");
    expect(statusActionSchema.parse({ id: ID, action: "decline", reason: "   " }).reason).toBeNull();
    expect(statusActionSchema.safeParse({ id: ID, action: "decline", reason: "x".repeat(201) }).success).toBe(false);
    expect(statusActionSchema.safeParse({ id: ID, action: "delete" }).success).toBe(false);
    expect(statusActionSchema.safeParse({ id: "nope", action: "accept" }).success).toBe(false);
  });

  it("reschedule: real date, 5-minute steps, 'anyway' flag", () => {
    expect(rescheduleSchema.parse({ id: ID, date: "2026-11-20", minute: "605", anyway: "1" })).toEqual({
      id: ID, date: "2026-11-20", minute: 605, anyway: true,
    });
    expect(rescheduleSchema.parse({ id: ID, date: "2026-11-20", minute: "600", anyway: "0" }).anyway).toBe(false);
    expect(rescheduleSchema.safeParse({ id: ID, date: "2026-11-20", minute: "602" }).success).toBe(false);
    expect(rescheduleSchema.safeParse({ id: ID, date: "2026-13-01", minute: "600" }).success).toBe(false);
  });

  it("change service needs a price", () => {
    expect(changeServiceSchema.safeParse({ id: ID, serviceId: ID, price: " " }).success).toBe(false);
  });

  const base = { staffId: ID, serviceId: ID, date: TODAY, minute: "600", anyway: "0" };
  it("walk-in: anonymous is fine; a name needs a mobile; any typed mobile form is normalised", () => {
    expect(newBookingSchema.parse({ ...base, kind: "walk_in", name: "", phone: "" })).toMatchObject({ name: null, phone: null });
    const named = newBookingSchema.safeParse({ ...base, kind: "walk_in", name: "Jo", phone: "" });
    expect(named.success).toBe(false);
    expect(named.error?.issues[0]).toMatchObject({ path: ["phone"] });
    expect(newBookingSchema.parse({ ...base, kind: "walk_in", name: " Jo  B ", phone: "07700 900123" })).toMatchObject({
      name: "Jo B", phone: "+447700900123",
    });
    const landline = newBookingSchema.safeParse({ ...base, kind: "walk_in", name: "Jo", phone: "0151 309 4681" });
    expect(landline.error?.issues[0]).toMatchObject({ path: ["phone"], message: PHONE_ERROR });
  });

  it("phone booking: name and mobile required", () => {
    const r = newBookingSchema.safeParse({ ...base, kind: "phone", name: "", phone: "" });
    expect(r.error?.issues.map((i) => i.path[0]).sort()).toEqual(["name", "phone"]);
    expect(newBookingSchema.safeParse({ ...base, kind: "phone", name: "Jo", phone: "+447700900123" }).success).toBe(true);
  });
});

describe("messages after actions", () => {
  it("accept → accepted, decline → declined with reason, cancel → cancelled, others → none", () => {
    expect(planForStatus("accept", null)).toEqual({ kind: "accepted" });
    expect(planForStatus("decline", "Fully booked")).toEqual({ kind: "declined", reason: "Fully booked" });
    expect(planForStatus("cancel", null)).toEqual({ kind: "cancelled" });
    expect(planForStatus("done", null)).toBeNull();
    expect(planForStatus("no_show", null)).toBeNull();
    expect(planForStatus("undo", null)).toBeNull();
  });

  it("'Message' from the details sheet matches the booking's state", () => {
    expect(planForBooking("confirmed", null)).toEqual({ kind: "accepted" });
    expect(planForBooking("declined", "Busy")).toEqual({ kind: "declined", reason: "Busy" });
    expect(planForBooking("cancelled", null)).toEqual({ kind: "cancelled" });
    expect(planForBooking("pending", null)).toBeNull();
  });

  it("builds the text with the change spelled out", () => {
    const shop = { name: "Salsa Barber", address: "41 Liverpool Road South, Maghull L31 7BN", phoneDisplay: "0151 309 4681", siteUrl: "https://x.test", bookingEnabled: false };
    const b = { name: "Jo Bloggs", serviceName: "Hair Cut", barberName: "Sam", startsAt: at("2026-11-20", "14:00"), pricePence: 1700, manageToken: "tok" };
    const text = bookingMessage({ kind: "updated", previousStartsAt: at("2026-11-20", "10:00").toISOString() }, b, shop);
    expect(text).toContain("New time: Fri 20 Nov, 2:00pm (was Fri 20 Nov, 10:00am)");
    expect(text).toContain("https://x.test/booking/tok");
    expect(bookingMessage({ kind: "declined", reason: "Fully booked" }, b, shop)).toContain("Fully booked");
    expect(bookingMessage({ kind: "accepted" }, b, shop)).toMatch(/^Hi Jo, your booking at Salsa Barber is confirmed\./);
  });
});

describe("staff error messages", () => {
  it("maps database errors to friendly text", () => {
    expect(staffErrorMessage({ code: "23P01", message: "conflicting key value" }, "x")).toBe(OVERLAP_ERROR);
    expect(staffErrorMessage({ code: "23P01", message: "overlap" }, "x")).toBe(OVERLAP_ERROR);
    expect(staffErrorMessage({ code: "42501", message: "not_allowed" }, "x")).toBe(NOT_ALLOWED_ERROR);
    expect(staffErrorMessage({ code: "P0001", message: "invalid_status_change" }, "x")).toBe(STALE_ERROR);
    expect(staffErrorMessage({ code: "P0001", message: "walk_in_window" }, "x")).toBe("Walk-ins can be added from a week ago up to tomorrow.");
    expect(staffErrorMessage({ code: "P0001", message: "name_needs_phone" }, "x")).toMatch(/mobile number/);
    expect(staffErrorMessage({ code: "XX000", message: "boom" }, "fallback")).toBe("fallback");
    expect(staffErrorMessage(null, "fallback")).toBe("fallback");
  });
});
