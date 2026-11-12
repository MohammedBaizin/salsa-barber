import { describe, expect, it } from "vitest";
import {
  availableSlots, checkSlot, chooseBarber, groupByPartOfDay, lastBookableDate, type AvailabilityBarber, type AvailabilityInput,
} from "@/lib/domain/availability";
import type { WeeklyHours } from "@/lib/domain/hours";
import { dateKey, formatTime, fromLondon } from "@/lib/domain/time";

const NINE_TO_SIX: WeeklyHours = {
  "1": { open: "09:00", close: "18:00" },
  "2": { open: "09:00", close: "18:00" },
  "3": { open: "09:00", close: "18:00" },
  "4": { open: "09:00", close: "18:00" },
  "5": { open: "09:00", close: "18:00" },
  "6": { open: "09:00", close: "17:00" },
};

const sam: AvailabilityBarber = { id: "sam", sort: 20, weeklyHours: NINE_TO_SIX, timeOff: [] };
const ali: AvailabilityBarber = {
  id: "ali",
  sort: 10,
  weeklyHours: { "1": { open: "12:00", close: "18:00" }, "2": { open: "12:00", close: "18:00" } },
  timeOff: [],
};

const at = (day: string, hhmm: string) => fromLondon(day, Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)));

function input(over: Partial<AvailabilityInput> = {}): AvailabilityInput {
  return {
    now: at("2026-11-09", "07:00"), // Monday morning
    durationMin: 30,
    shopHours: NINE_TO_SIX,
    closures: [],
    barbers: [sam],
    bookings: [],
    minNoticeMinutes: 120,
    bookingWindowDays: 7,
    ...over,
  };
}

const times = (days: ReturnType<typeof availableSlots>, day: string) =>
  days.find((d) => d.date === day)!.times.map((t) => formatTime(t.start));

describe("availableSlots", () => {
  it("offers a 15-minute grid inside hours where the whole service fits", () => {
    const days = availableSlots(input());
    const monday = times(days, "2026-11-09");
    expect(monday[0]).toBe("9:00am");
    expect(monday[1]).toBe("9:15am");
    expect(monday.at(-1)).toBe("5:30pm"); // 5:30–6:00 fits, 5:45 doesn't
    expect(monday).toHaveLength(35);
  });

  it("respects minimum notice", () => {
    const days = availableSlots(input({ now: at("2026-11-09", "10:05") }));
    expect(times(days, "2026-11-09")[0]).toBe("12:15pm"); // 10:05 + 2h = 12:05 -> next quarter hour
  });

  it("covers the booking window (window 7 = today + 6 days), with closed days empty", () => {
    const days = availableSlots(input());
    expect(days.map((d) => d.date)).toEqual([
      "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15",
    ]);
    expect(times(days, "2026-11-15")).toEqual([]); // Sunday
    expect(times(days, "2026-11-14").at(-1)).toBe("4:30pm"); // Saturday closes at 5
    expect(lastBookableDate(at("2026-11-09", "07:00"), 1)).toBe("2026-11-09");
  });

  it("skips closures and time off", () => {
    const days = availableSlots(
      input({ closures: ["2026-11-10"], barbers: [{ ...sam, timeOff: [{ startsOn: "2026-11-11", endsOn: "2026-11-12" }] }] }),
    );
    expect(times(days, "2026-11-10")).toEqual([]);
    expect(times(days, "2026-11-11")).toEqual([]);
    expect(times(days, "2026-11-12")).toEqual([]);
    expect(times(days, "2026-11-13").length).toBeGreaterThan(0);
  });

  it("uses the overlap of shop and barber hours", () => {
    const days = availableSlots(input({ barbers: [ali] }));
    const monday = times(days, "2026-11-09");
    expect(monday[0]).toBe("12:00pm");
    expect(monday.at(-1)).toBe("5:30pm");
    expect(times(days, "2026-11-11")).toEqual([]); // Ali doesn't work Wednesdays
  });

  it("blocks overlapping bookings but allows back-to-back", () => {
    const days = availableSlots(
      input({ bookings: [{ id: "b1", staffId: "sam", startsAt: at("2026-11-09", "10:00"), endsAt: at("2026-11-09", "10:45") }] }),
    );
    const monday = times(days, "2026-11-09");
    expect(monday).toContain("9:30am"); // 9:30–10:00 ends as the booking starts
    expect(monday).not.toContain("9:45am");
    expect(monday).not.toContain("10:00am");
    expect(monday).not.toContain("10:30am");
    expect(monday).toContain("10:45am");
  });

  it("treats the customer's own booking as free when they change it", () => {
    const own = { id: "mine", staffId: "sam", startsAt: at("2026-11-09", "10:00"), endsAt: at("2026-11-09", "10:30") };
    expect(times(availableSlots(input({ bookings: [own] })), "2026-11-09")).not.toContain("10:00am");
    expect(times(availableSlots(input({ bookings: [own], ignoreBookingId: "mine" })), "2026-11-09")).toContain("10:00am");
  });

  it("any barber: a time shows if at least one barber is free, listing who", () => {
    const busySam = { staffId: "sam", startsAt: at("2026-11-09", "12:00"), endsAt: at("2026-11-09", "12:30") };
    const days = availableSlots(input({ barbers: [sam, ali], bookings: [busySam] }));
    const monday = days.find((d) => d.date === "2026-11-09")!;
    const noon = monday.times.find((t) => formatTime(t.start) === "12:00pm")!;
    expect(noon.barberIds).toEqual(["ali"]);
    const ten = monday.times.find((t) => formatTime(t.start) === "10:00am")!;
    expect(ten.barberIds).toEqual(["sam"]);
    const one = monday.times.find((t) => formatTime(t.start) === "1:00pm")!;
    expect(one.barberIds.sort()).toEqual(["ali", "sam"]);
  });

  it("no times at all when nobody can do it", () => {
    expect(availableSlots(input({ barbers: [] })).every((d) => d.times.length === 0)).toBe(true);
  });

  it("works across the clocks going back (Sun 25 Oct 2026 -> Mon 26 Oct)", () => {
    const days = availableSlots(input({ now: at("2026-10-24", "07:00"), bookingWindowDays: 3 }));
    const monday = days.find((d) => d.date === "2026-10-26")!;
    expect(monday.times[0].start.toISOString()).toBe("2026-10-26T09:00:00.000Z"); // GMT
    const saturday = days.find((d) => d.date === "2026-10-24")!;
    expect(saturday.times[0].start.toISOString()).toBe("2026-10-24T08:00:00.000Z"); // BST
  });

  it("works across the clocks going forward (Sun 29 Mar 2026 -> Mon 30 Mar)", () => {
    const days = availableSlots(input({ now: at("2026-03-28", "07:00"), bookingWindowDays: 3 }));
    expect(days.find((d) => d.date === "2026-03-30")!.times[0].start.toISOString()).toBe("2026-03-30T08:00:00.000Z");
    expect(days.find((d) => d.date === "2026-03-28")!.times[0].start.toISOString()).toBe("2026-03-28T09:00:00.000Z");
  });

  it("gives the same times whatever the device time zone", () => {
    const original = process.env.TZ;
    const run = (tz: string) => {
      process.env.TZ = tz;
      return availableSlots(input()).map((d) => [d.date, d.times.map((t) => t.start.toISOString())]);
    };
    try {
      const tokyo = run("Asia/Tokyo");
      const la = run("America/Los_Angeles");
      expect(new Date("2026-11-09T12:00:00Z").getTimezoneOffset()).toBe(480); // the switch really happened
      expect(la).toEqual(tokyo);
      expect(dateKey(new Date(tokyo[0][1][0]))).toBe("2026-11-09");
      expect(formatTime(new Date(tokyo[0][1][0]))).toBe("9:00am");
    } finally {
      process.env.TZ = original;
    }
  });
});

describe("checkSlot (error codes shared with request_booking)", () => {
  it.each([
    ["2026-11-09", "09:10", "invalid_time"],
    ["2026-11-09", "08:30", "too_soon"],
    ["2026-11-20", "10:00", "too_far"],
    ["2026-11-15", "10:00", "shop_closed"],
    ["2026-11-09", "17:45", "outside_hours"],
    ["2026-11-10", "10:00", "barber_unavailable"],
    ["2026-11-09", "10:15", "slot_taken"],
    ["2026-11-09", "10:30", null],
  ] as const)("%s %s -> %s", (day, time, problem) => {
    const i = input({
      barbers: [{ ...sam, timeOff: [{ startsOn: "2026-11-10", endsOn: "2026-11-10" }] }],
      bookings: [{ staffId: "sam", startsAt: at("2026-11-09", "10:00"), endsAt: at("2026-11-09", "10:30") }],
    });
    expect(checkSlot(i, i.barbers[0], at(day, time))).toBe(problem);
  });

  it("refuses seconds and milliseconds", () => {
    const i = input();
    expect(checkSlot(i, sam, new Date(at("2026-11-09", "10:00").getTime() + 1000))).toBe("invalid_time");
  });

  it("closures are shop_closed", () => {
    const i = input({ closures: ["2026-11-11"] });
    expect(checkSlot(i, sam, at("2026-11-11", "10:00"))).toBe("shop_closed");
  });
});

describe("chooseBarber (any barber)", () => {
  const both = (bookings: AvailabilityInput["bookings"]) => input({ barbers: [sam, ali], bookings, now: at("2026-11-09", "07:00") });

  it("prefers the barber who has been free longest", () => {
    // At 3pm: Sam finished at 2:30pm, Ali finished at 1pm -> Ali
    const i = both([
      { staffId: "sam", startsAt: at("2026-11-09", "14:00"), endsAt: at("2026-11-09", "14:30") },
      { staffId: "ali", startsAt: at("2026-11-09", "12:30"), endsAt: at("2026-11-09", "13:00") },
    ]);
    expect(chooseBarber(i, at("2026-11-09", "15:00"))).toBe("ali");
  });

  it("with no bookings, the one who opened earliest (Sam from 9) beats Ali (from 12)", () => {
    expect(chooseBarber(both([]), at("2026-11-09", "15:00"))).toBe("sam");
  });

  it("ties go to fewest bookings that day, then sort order", () => {
    const twoForSam = both([
      { staffId: "sam", startsAt: at("2026-11-09", "16:00"), endsAt: at("2026-11-09", "16:30") },
      { staffId: "sam", startsAt: at("2026-11-09", "17:00"), endsAt: at("2026-11-09", "17:30") },
      { staffId: "ali", startsAt: at("2026-11-09", "16:00"), endsAt: at("2026-11-09", "16:30") },
    ]);
    // At 12pm neither has finished anything; Sam opened at 9, Ali at 12 -> Sam (earliest free wins first)
    expect(chooseBarber(twoForSam, at("2026-11-09", "12:00"))).toBe("sam");
    // Same opening time: fewest bookings decides, then sort
    const sameHours = { ...ali, weeklyHours: NINE_TO_SIX };
    const i = input({ barbers: [sam, sameHours], bookings: twoForSam.bookings });
    expect(chooseBarber(i, at("2026-11-09", "12:00"))).toBe("ali");
    expect(chooseBarber(input({ barbers: [sam, sameHours] }), at("2026-11-09", "12:00"))).toBe("ali"); // sort 10 < 20
  });

  it("returns null when nobody is free", () => {
    expect(chooseBarber(both([]), at("2026-11-09", "18:00"))).toBeNull();
  });
});

describe("groupByPartOfDay", () => {
  it("splits morning / afternoon / evening", () => {
    const t = ["09:00", "11:45", "12:00", "16:45", "17:00"].map((h) => ({ start: at("2026-11-09", h) }));
    const g = groupByPartOfDay(t);
    expect(g.morning.map((x) => formatTime(x.start))).toEqual(["9:00am", "11:45am"]);
    expect(g.afternoon.map((x) => formatTime(x.start))).toEqual(["12:00pm", "4:45pm"]);
    expect(g.evening.map((x) => formatTime(x.start))).toEqual(["5:00pm"]);
  });
});
