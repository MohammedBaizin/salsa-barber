import { describe, expect, it } from "vitest";
import { availableSlots, checkSlot, serviceBookableOn, type AvailabilityInput } from "@/lib/domain/availability";
import { scheduleWarnings } from "@/lib/domain/schedule";
import { formatDays, fromLondon } from "@/lib/domain/time";
import { bookingErrorMessage } from "@/lib/domain/validation";
import { cleanAlt, PHOTO_LIMITS, photoMeter, photoSet } from "@/lib/domain/website";

const EVERY_DAY = Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((d) => [String(d), { open: "09:00", close: "18:00" }]));
const at = (day: string, hhmm: string) => fromLondon(day, Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)));

const input = (serviceDays: number[] | null): AvailabilityInput => ({
  now: at("2026-11-09", "07:00"), // Monday
  durationMin: 30,
  serviceDays,
  shopHours: EVERY_DAY,
  closures: [],
  barbers: [{ id: "sam", sort: 1, weeklyHours: EVERY_DAY, timeOff: [] }],
  bookings: [],
  minNoticeMinutes: 0,
  bookingWindowDays: 7,
});

describe("service bookable days (OAP Cut Mon–Thu)", () => {
  it("only offers times on the service's days", () => {
    const days = availableSlots(input([1, 2, 3, 4]));
    expect(days.filter((d) => d.times.length > 0).map((d) => d.date)).toEqual(["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12"]);
    expect(availableSlots(input(null)).filter((d) => d.times.length > 0)).toHaveLength(7);
  });

  it("checkSlot says service_day with a friendly message", () => {
    const i = input([1, 2, 3, 4]);
    expect(checkSlot(i, i.barbers[0], at("2026-11-13", "10:00"))).toBe("service_day"); // Friday
    expect(checkSlot(i, i.barbers[0], at("2026-11-12", "10:00"))).toBeNull(); // Thursday
    expect(bookingErrorMessage("service_day")).toMatch(/can't be booked online on that day/);
    expect(serviceBookableOn(null, 7)).toBe(true);
  });

  it("staff get a warning, not a block", () => {
    const warnings = scheduleWarnings({
      start: at("2026-11-13", "10:00"),
      durationMin: 30,
      shopHours: EVERY_DAY,
      closures: [],
      barberName: "Sam",
      barberHours: EVERY_DAY,
      timeOff: [],
      service: { name: "OAP Cut", days: [1, 2, 3, 4] },
    });
    expect(warnings).toEqual([{ code: "service_day", message: "OAP Cut is normally only booked Mon–Thu." }]);
  });
});

describe("formatDays", () => {
  it.each([
    [[1, 2, 3, 4], "Mon–Thu"],
    [[1, 3, 5], "Mon, Wed & Fri"],
    [[6, 7], "Sat & Sun"],
    [[1, 2, 3, 5, 6], "Mon–Wed, Fri & Sat"],
    [[7, 1, 1], "Mon & Sun"],
    [[1, 2, 3, 4, 5, 6, 7], "every day"],
    [null, "every day"],
    [[], "no days"],
  ] as const)("%j -> %s", (days, text) => {
    expect(formatDays(days as number[] | null)).toBe(text);
  });
});

describe("photo limits", () => {
  it("slideshow 3, recent cuts 4", () => {
    expect(PHOTO_LIMITS).toEqual({ slideshow: 3, recent_cuts: 4 });
    expect(photoMeter("recent_cuts", 3)).toEqual({ label: "3 of 4", full: false });
    expect(photoMeter("slideshow", 3)).toEqual({ label: "3 of 3", full: true });
    expect(photoSet(true)).toBe("slideshow");
  });

  it("alt text is required and tidy", () => {
    expect(cleanAlt("  Skin fade\n with beard ")).toBe("Skin fade with beard");
    expect(cleanAlt("   ")).toBeNull();
    expect(cleanAlt("x".repeat(161))).toBeNull();
  });
});
