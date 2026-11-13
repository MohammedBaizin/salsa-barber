import { describe, expect, it } from "vitest";
import { fitsHours, formatWindow, groupWeeklyHours, hasAnyHours, openStatus, type WeeklyHours } from "@/lib/domain/hours";
import { weeklyHoursSchema } from "@/lib/domain/hours-schema";
import { fromLondon } from "@/lib/domain/time";

const WEEK: WeeklyHours = {
  "1": { open: "09:00", close: "18:00" },
  "2": { open: "09:00", close: "18:00" },
  "3": { open: "09:00", close: "18:00" },
  "4": { open: "09:00", close: "18:00" },
  "5": { open: "09:00", close: "19:00" },
  "6": { open: "09:00", close: "17:00" },
  "7": null,
};

describe("weeklyHoursSchema (mirrors app.valid_weekly_hours)", () => {
  it.each([
    [{}, true],
    [WEEK, true],
    [{ "8": { open: "09:00", close: "18:00" } }, false],
    [{ "1": { open: "18:00", close: "09:00" } }, false],
    [{ "1": { open: "09:00", close: "09:00" } }, false],
    [{ "1": { open: "9:00", close: "18:00" } }, false],
    [{ "1": { open: "09:00", close: "24:00" } }, false],
    [{ "1": { open: "09:00" } }, false],
    [{ "1": { open: "09:00", close: "18:00", extra: 1 } }, false],
  ])("%j -> %s", (hours, ok) => {
    expect(weeklyHoursSchema.safeParse(hours).success).toBe(ok);
  });
});

describe("fitsHours (mirrors app.fits_hours)", () => {
  const at = (day: string, hhmm: string) => fromLondon(day, Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)));
  it("checks the London window, on DST change days too", () => {
    // Mon 30 Mar 2026 (first Monday of BST)
    expect(fitsHours(WEEK, at("2026-03-30", "09:00"), at("2026-03-30", "09:30"))).toBe(true);
    expect(fitsHours(WEEK, at("2026-03-30", "08:45"), at("2026-03-30", "09:15"))).toBe(false);
    expect(fitsHours(WEEK, at("2026-03-30", "17:30"), at("2026-03-30", "18:00"))).toBe(true);
    expect(fitsHours(WEEK, at("2026-03-30", "17:45"), at("2026-03-30", "18:15"))).toBe(false);
    // Sunday closed
    expect(fitsHours(WEEK, at("2026-03-29", "10:00"), at("2026-03-29", "10:30"))).toBe(false);
    // Mon 26 Oct 2026 (first Monday of GMT)
    expect(fitsHours(WEEK, at("2026-10-26", "09:00"), at("2026-10-26", "09:30"))).toBe(true);
  });
});

describe("groupWeeklyHours", () => {
  it("groups consecutive days with the same hours", () => {
    expect(groupWeeklyHours(WEEK)).toEqual([
      { days: "Mon–Thu", hours: "9:00am–6:00pm", closed: false },
      { days: "Fri", hours: "9:00am–7:00pm", closed: false },
      { days: "Sat", hours: "9:00am–5:00pm", closed: false },
      { days: "Sun", hours: "Closed", closed: true },
    ]);
  });

  it("uses & for two-day groups and treats missing days as closed", () => {
    expect(groupWeeklyHours({ "6": { open: "10:00", close: "16:00" }, "7": { open: "10:00", close: "16:00" } })).toEqual([
      { days: "Mon–Fri", hours: "Closed", closed: true },
      { days: "Sat & Sun", hours: "10:00am–4:00pm", closed: false },
    ]);
    expect(hasAnyHours({})).toBe(false);
    expect(formatWindow(null)).toBe("Closed");
  });
});

describe("openStatus", () => {
  const now = (day: string, hhmm: string) => fromLondon(day, Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)));

  it("open now with closing time", () => {
    const s = openStatus(WEEK, [], now("2026-11-13", "10:00")); // Friday
    expect(s).toMatchObject({ open: true, label: "Open now · closes 7:00pm" });
  });

  it("closed before opening: opens later today", () => {
    expect(openStatus(WEEK, [], now("2026-11-13", "08:15")).label).toBe("Closed · opens 9:00am");
  });

  it("closed after closing: opens tomorrow", () => {
    expect(openStatus(WEEK, [], now("2026-11-13", "19:00")).label).toBe("Closed · opens tomorrow 9:00am");
  });

  it("skips closed days and closures", () => {
    // Saturday evening -> Sunday closed -> Monday 16 Nov is a closure -> Tuesday
    const s = openStatus(WEEK, ["2026-11-16"], now("2026-11-14", "18:00"));
    expect(s.label).toBe("Closed · opens Tue 17 Nov 9:00am");
    expect(s.open).toBe(false);
  });

  it("is closed all day on a closure", () => {
    expect(openStatus(WEEK, ["2026-11-13"], now("2026-11-13", "10:00")).open).toBe(false);
  });

  it("has no next opening when no hours are set", () => {
    expect(openStatus({}, [], now("2026-11-13", "10:00"))).toEqual({ open: false, nextOpen: null, label: "Closed" });
  });
});
