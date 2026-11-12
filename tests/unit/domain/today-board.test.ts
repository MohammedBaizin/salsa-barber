import { describe, expect, it } from "vitest";
import { isActive, moreItems, navItems } from "@/lib/dashboard/nav";
import { fromLondon } from "@/lib/domain/time";
import {
  bookingName, hasOtherBooking, requestFlags, scheduleWithNow, sortRequests, type BookingStatus,
} from "@/lib/domain/today";

const at = (day: string, hhmm: string) => fromLondon(day, Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)));
const DAY = "2026-11-12";
const NOW = at(DAY, "12:00");

function req(over: Partial<Parameters<typeof requestFlags>[0]> = {}) {
  return {
    id: "r1",
    status: "pending" as BookingStatus,
    clientId: "c1",
    startsAt: at(DAY, "15:00"),
    endsAt: at(DAY, "15:30"),
    createdAt: at(DAY, "10:00"),
    changedFrom: null,
    ...over,
  };
}

describe("bookingName", () => {
  it("prefers the name given for this booking, then the client's name", () => {
    expect(bookingName({ bookedName: "Jo Junior", clientName: "Jo Bloggs", source: "online" })).toBe("Jo Junior");
    expect(bookingName({ bookedName: null, clientName: "Jo Bloggs", source: "online" })).toBe("Jo Bloggs");
  });
  it("labels bookings without a client", () => {
    expect(bookingName({ bookedName: null, clientName: null, source: "walk_in" })).toBe("Walk-in customer");
    expect(bookingName({ bookedName: null, clientName: null, source: "online" })).toBe("Deleted client");
    expect(bookingName({ bookedName: null, clientName: null, source: "staff" })).toBe("Deleted client");
  });
});

describe("request flags", () => {
  it("no flags for a fresh request", () => {
    expect(requestFlags(req(), [], NOW)).toEqual([]);
  });

  it("waiting over 12 hours, but 'Expired' once its time has passed", () => {
    expect(requestFlags(req({ createdAt: at("2026-11-11", "23:59") }), [], NOW)).toEqual(["stale"]);
    expect(requestFlags(req({ createdAt: at(DAY, "00:00") }), [], NOW)).toEqual([]); // exactly 12 h: not yet
    const past = req({ startsAt: at(DAY, "11:00"), endsAt: at(DAY, "11:30"), createdAt: at("2026-11-10", "09:00") });
    expect(requestFlags(past, [], NOW)).toEqual(["expired"]);
    expect(requestFlags(req({ startsAt: NOW }), [], NOW)).toEqual(["expired"]);
  });

  it("same number has another live booking that hasn't ended", () => {
    const other = { id: "b2", clientId: "c1", status: "confirmed" as BookingStatus, endsAt: at(DAY, "17:00") };
    expect(requestFlags(req(), [other], NOW)).toEqual(["same_number"]);
    expect(requestFlags(req(), [{ ...other, status: "cancelled" }], NOW)).toEqual([]);
    expect(requestFlags(req(), [{ ...other, endsAt: at(DAY, "11:00") }], NOW)).toEqual([]);
    expect(requestFlags(req(), [{ ...other, clientId: "c2" }], NOW)).toEqual([]);
    // The request itself doesn't count.
    expect(requestFlags(req(), [{ ...other, id: "r1" }], NOW)).toEqual([]);
    expect(hasOtherBooking({ id: "r1", clientId: null }, [{ ...other, clientId: null }], NOW)).toBe(false);
  });

  it("changed by the customer; flags keep their order", () => {
    const b = req({ changedFrom: "old", createdAt: at("2026-11-10", "09:00") });
    const other = { id: "b2", clientId: "c1", status: "pending" as BookingStatus, endsAt: at(DAY, "18:00") };
    expect(requestFlags(b, [other], NOW)).toEqual(["stale", "same_number", "changed"]);
  });

  it("only pending bookings get request flags", () => {
    expect(requestFlags(req({ status: "confirmed", changedFrom: "old" }), [], NOW)).toEqual([]);
  });
});

describe("sortRequests", () => {
  it("keeps pending only, soonest appointment first, then oldest request", () => {
    const rows = [
      { id: "late", status: "pending" as BookingStatus, startsAt: at("2026-11-14", "10:00"), createdAt: at(DAY, "09:00") },
      { id: "done", status: "confirmed" as BookingStatus, startsAt: at(DAY, "09:00"), createdAt: at(DAY, "08:00") },
      { id: "soon-new", status: "pending" as BookingStatus, startsAt: at("2026-11-13", "10:00"), createdAt: at(DAY, "11:00") },
      { id: "soon-old", status: "pending" as BookingStatus, startsAt: at("2026-11-13", "10:00"), createdAt: at(DAY, "07:00") },
    ];
    expect(sortRequests(rows).map((r) => r.id)).toEqual(["soon-old", "soon-new", "late"]);
  });
});

describe("scheduleWithNow", () => {
  const b = (id: string, hhmm: string, status: BookingStatus = "confirmed", staffId = "sam") => ({
    id,
    status,
    staffId,
    startsAt: at(DAY, hhmm),
  });
  const ids = (items: ReturnType<typeof scheduleWithNow<ReturnType<typeof b>>>) =>
    items.map((i) => (i.kind === "now" ? "NOW" : i.booking.id));

  it("puts the now line before the first booking that hasn't started (in-progress ones stay above)", () => {
    const rows = [b("c", "14:00"), b("a", "09:00", "completed"), b("b", "11:45")];
    expect(ids(scheduleWithNow(rows, NOW, { day: DAY }))).toEqual(["a", "b", "NOW", "c"]);
  });

  it("at the end when everything has started, at the top when nothing has", () => {
    expect(ids(scheduleWithNow([b("a", "09:00")], NOW, { day: DAY }))).toEqual(["a", "NOW"]);
    expect(ids(scheduleWithNow([b("a", "13:00")], NOW, { day: DAY }))).toEqual(["NOW", "a"]);
    expect(ids(scheduleWithNow([], NOW, { day: DAY }))).toEqual(["NOW"]);
  });

  it("a booking starting exactly now counts as started", () => {
    expect(ids(scheduleWithNow([b("a", "12:00")], NOW, { day: DAY }))).toEqual(["a", "NOW"]);
  });

  it("leaves out cancelled and declined bookings, and filters by barber", () => {
    const rows = [b("x", "10:00", "cancelled"), b("y", "10:30", "declined"), b("p", "13:00", "pending"), b("j", "13:30", "confirmed", "jamie")];
    expect(ids(scheduleWithNow(rows, NOW, { day: DAY }))).toEqual(["NOW", "p", "j"]);
    expect(ids(scheduleWithNow(rows, NOW, { day: DAY, staffId: "jamie" }))).toEqual(["NOW", "j"]);
  });

  it("no now line on another day (London date, not UTC)", () => {
    expect(ids(scheduleWithNow([b("a", "13:00")], NOW, { day: "2026-11-13" }))).toEqual(["a"]);
    // 00:30 London in summer is still the previous day in UTC.
    const summerNow = fromLondon("2026-07-01", 30);
    expect(ids(scheduleWithNow([], summerNow, { day: "2026-07-01" }))).toEqual(["NOW"]);
  });
});

describe("dashboard navigation", () => {
  it("owner/admin tabs: Today · Calendar · Clients · Team · More", () => {
    expect(navItems("owner").map((i) => i.label)).toEqual(["Today", "Calendar", "Clients", "Team", "More"]);
    expect(navItems("admin").map((i) => i.label)).toEqual(["Today", "Calendar", "Clients", "Team", "More"]);
  });

  it("barber tabs: Today · Calendar · Clients · Me", () => {
    expect(navItems("barber").map((i) => i.label)).toEqual(["Today", "Calendar", "Clients", "Me"]);
    expect(navItems("barber").find((i) => i.label === "Me")?.href).toBe("/dashboard/account");
  });

  it("More lists Backup for admins only", () => {
    expect(moreItems("owner").map((i) => i.label)).toEqual(["Services and prices", "Website", "Settings", "Activity", "Account"]);
    expect(moreItems("admin").map((i) => i.label)).toContain("Backup");
  });

  it("active item: Today only on /dashboard; More lights up for its pages", () => {
    const [today, calendar, , , more] = navItems("owner");
    expect(isActive(today, "/dashboard")).toBe(true);
    expect(isActive(today, "/dashboard/calendar")).toBe(false);
    expect(isActive(calendar, "/dashboard/calendar")).toBe(true);
    expect(isActive(calendar, "/dashboard/calendarx")).toBe(false);
    expect(isActive(more, "/dashboard/settings")).toBe(true);
    expect(isActive(more, "/dashboard/more")).toBe(true);
    expect(isActive(more, "/dashboard/clients")).toBe(false);
    const me = navItems("barber").at(-1)!;
    expect(isActive(me, "/dashboard/services")).toBe(true);
  });
});
