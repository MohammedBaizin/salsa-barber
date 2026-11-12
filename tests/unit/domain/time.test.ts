import { describe, expect, it } from "vitest";
import {
  addDays, dateKey, daysBetween, formatClock, formatDateTime, formatDay, formatDayLong, formatMinutes, formatRelativeDay,
  formatTime, fromLondon, isDateKey, isoWeekday, londonParts, minuteOfDay, parseHHMM, toHHMM,
} from "@/lib/domain/time";

// 2026 DST changes in London: clocks forward Sun 29 Mar (01:00 -> 02:00), back Sun 25 Oct (02:00 -> 01:00).

describe("fromLondon / dateKey / minuteOfDay", () => {
  it("converts London wall-clock to UTC in winter and summer", () => {
    expect(fromLondon("2026-01-15", 9 * 60).toISOString()).toBe("2026-01-15T09:00:00.000Z");
    expect(fromLondon("2026-07-15", 9 * 60).toISOString()).toBe("2026-07-15T08:00:00.000Z");
  });

  it.each(["2026-03-29", "2026-10-25", "2026-06-01", "2026-12-31"])("round-trips every quarter hour on %s", (day) => {
    for (let m = 0; m < 24 * 60; m += 15) {
      // Skip the hour that doesn't exist (spring) or happens twice (autumn); the shop never trades then.
      if (m >= 60 && m < 120 && (day === "2026-03-29" || day === "2026-10-25")) continue;
      const d = fromLondon(day, m);
      expect(dateKey(d), `${day} ${toHHMM(m)}`).toBe(day);
      expect(minuteOfDay(d), `${day} ${toHHMM(m)}`).toBe(m);
    }
  });

  it("handles the DST change days correctly", () => {
    expect(fromLondon("2026-03-29", 9 * 60).toISOString()).toBe("2026-03-29T08:00:00.000Z");
    expect(fromLondon("2026-03-28", 9 * 60).toISOString()).toBe("2026-03-28T09:00:00.000Z");
    expect(fromLondon("2026-10-25", 9 * 60).toISOString()).toBe("2026-10-25T09:00:00.000Z");
    expect(fromLondon("2026-10-24", 9 * 60).toISOString()).toBe("2026-10-24T08:00:00.000Z");
    // The quarter hours of both change days are 15 minutes apart outside the 1–2am hour.
    expect(fromLondon("2026-03-29", 3 * 60).getTime() - fromLondon("2026-03-29", 0).getTime()).toBe(2 * 3_600_000);
    expect(fromLondon("2026-10-25", 3 * 60).getTime() - fromLondon("2026-10-25", 0).getTime()).toBe(4 * 3_600_000);
  });

  it("uses London's date near midnight, not UTC's", () => {
    expect(dateKey(new Date("2026-07-15T23:30:00Z"))).toBe("2026-07-16");
    expect(dateKey(new Date("2026-01-15T23:30:00Z"))).toBe("2026-01-15");
    expect(londonParts(new Date("2026-07-15T23:30:00Z"))).toMatchObject({ hour: 0, minute: 30, isoWeekday: 4 });
  });
});

describe("date key arithmetic", () => {
  it("adds days across months, years and DST", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
    expect(daysBetween("2026-10-30", "2026-10-20")).toBe(-10);
  });

  it("knows ISO weekdays", () => {
    expect(isoWeekday("2026-11-09")).toBe(1); // Monday
    expect(isoWeekday("2026-11-15")).toBe(7); // Sunday
  });

  it("validates date keys", () => {
    expect(isDateKey("2026-02-28")).toBe(true);
    expect(isDateKey("2026-02-29")).toBe(false);
    expect(isDateKey("2026-2-1")).toBe(false);
    expect(isDateKey(20260101)).toBe(false);
  });
});

describe("HH:MM", () => {
  it("parses and prints", () => {
    expect(parseHHMM("09:30")).toBe(570);
    expect(parseHHMM("23:59")).toBe(1439);
    expect(toHHMM(570)).toBe("09:30");
    expect(() => parseHHMM("24:00")).toThrow();
    expect(() => parseHHMM("9:30")).toThrow();
  });
});

describe("display (UK, London time)", () => {
  it("formats times like 4:00pm", () => {
    expect(formatClock(0)).toBe("12:00am");
    expect(formatClock(9 * 60 + 5)).toBe("9:05am");
    expect(formatClock(12 * 60)).toBe("12:00pm");
    expect(formatClock(16 * 60)).toBe("4:00pm");
    expect(formatTime(new Date("2026-07-15T15:00:00Z"))).toBe("4:00pm");
  });

  it("formats days like Fri 9 Oct", () => {
    expect(formatDay("2026-10-09")).toBe("Fri 9 Oct");
    expect(formatDayLong("2026-10-09")).toBe("Friday 9 October");
    expect(formatDateTime(new Date("2026-10-09T15:00:00Z"))).toBe("Fri 9 Oct, 4:00pm");
    expect(formatDay(new Date("2026-07-15T23:30:00Z"))).toBe("Thu 16 Jul");
  });

  it("relative days", () => {
    expect(formatRelativeDay("2026-11-12", "2026-11-12")).toBe("Today");
    expect(formatRelativeDay("2026-11-13", "2026-11-12")).toBe("Tomorrow");
    expect(formatRelativeDay("2026-11-11", "2026-11-12")).toBe("Yesterday");
    expect(formatRelativeDay("2026-11-20", "2026-11-12")).toBe("Fri 20 Nov");
  });

  it("durations", () => {
    expect(formatMinutes(25)).toBe("25 min");
    expect(formatMinutes(60)).toBe("1 hr");
    expect(formatMinutes(65)).toBe("1 hr 5 min");
  });
});
