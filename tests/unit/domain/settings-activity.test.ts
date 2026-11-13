import { describe, expect, it } from "vitest";
import { activityHref, activityTypeFilter, entryDetail, parseActivityParams } from "@/lib/domain/activity";
import { bookingsOutsideHours, closureDateProblem, closureWarning, hoursChangeWarning } from "@/lib/domain/settings";
import { fromLondon } from "@/lib/domain/time";

describe("settings: opening hours and closed days", () => {
  const hours = { "1": { open: "09:00", close: "18:00" }, "6": { open: "09:00", close: "13:00" } };
  const at = (day: string, from: number, to: number) => ({ startsAt: fromLondon(day, from), endsAt: fromLondon(day, to) });

  it("counts upcoming bookings that no longer fit (closed day, too early, running past closing)", () => {
    expect(
      bookingsOutsideHours(hours, [
        at("2026-11-16", 9 * 60, 9 * 60 + 30), // Mon 9:00, fits
        at("2026-11-16", 17 * 60 + 45, 18 * 60), // Mon, ends at closing: fits
        at("2026-11-17", 10 * 60, 10 * 60 + 30), // Tue: closed
        at("2026-11-21", 12 * 60 + 45, 13 * 60 + 15), // Sat: runs past 1pm
        at("2026-11-21", 8 * 60 + 30, 9 * 60), // Sat: before opening
      ]),
    ).toBe(3);
  });

  it("warnings: none for zero; singular and plural wording", () => {
    expect(hoursChangeWarning(0)).toBeNull();
    expect(hoursChangeWarning(1)).toBe(
      "1 upcoming booking falls outside the new hours. It stays booked: move or cancel it from the Calendar if needed.",
    );
    expect(hoursChangeWarning(3)).toMatch(/^3 upcoming bookings fall outside the new hours\. They stay booked/);
    expect(closureWarning(0)).toBeNull();
    expect(closureWarning(1)).toBe("1 booking is on that day. It stays booked: move or cancel it from the Calendar.");
    expect(closureWarning(2)).toMatch(/^2 bookings are on that day\. They stay booked/);
  });

  it("closed days: today or later, within two years", () => {
    expect(closureDateProblem("2026-11-13", "2026-11-13")).toBeNull();
    expect(closureDateProblem("2026-11-12", "2026-11-13")).toBe("Choose today or a later date.");
    expect(closureDateProblem("2028-11-12", "2026-11-13")).toBeNull();
    expect(closureDateProblem("2028-11-13", "2026-11-13")).toBe("Choose a date within the next two years.");
  });
});

describe("activity log", () => {
  it("reads filters from the URL, ignoring anything unknown", () => {
    const id = "0b5e8a52-3c1d-4f0e-9a7b-2d6c8e1f4a90";
    expect(parseActivityParams({ person: id.toUpperCase(), type: "services", before: "120" })).toEqual({ person: id, type: "services", before: 120 });
    expect(parseActivityParams({ person: "x", type: "logins", before: "-1" })).toEqual({ person: null, type: null, before: null });
    expect(parseActivityParams({ type: ["bookings", "clients"], before: "0" })).toEqual({ person: null, type: "bookings", before: null });
  });

  it("links keep only what's set", () => {
    expect(activityHref({ person: null, type: null, before: null })).toBe("/dashboard/activity");
    expect(activityHref({ person: null, type: "team", before: 40 })).toBe("/dashboard/activity?type=team&before=40");
  });

  it("type filters match every action prefix", () => {
    expect(activityTypeFilter("team")).toBe("action.like.staff.*,action.like.time_off.*,action.like.account.*");
    expect(activityTypeFilter("services")).toBe("action.like.service.*");
  });

  it("detail line: settings list what changed; edits add changed fields; others keep the summary", () => {
    expect(entryDetail({ entity: "settings", action: "settings.update", summary: "shop_hours", changed: ["shop_hours", "min_notice_minutes"] })).toBe(
      "Changed opening hours and minimum notice",
    );
    expect(entryDetail({ entity: "service", action: "service.update", summary: "Hair Cut · £17.00 · 30 min", changed: ["duration_min", "price_pence"] })).toBe(
      "Hair Cut · £17.00 · 30 min · Changed length and price",
    );
    expect(entryDetail({ entity: "closure", action: "closure.insert", summary: "Thu 25 Dec 2026 · Christmas", changed: null })).toBe(
      "Thu 25 Dec 2026 · Christmas",
    );
    expect(entryDetail({ entity: "booking", action: "booking.accept", summary: null, changed: ["status"] })).toBeNull();
  });
});
