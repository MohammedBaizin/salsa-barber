import { describe, expect, it } from "vitest";
import { HOURS_ORDER_ERROR, hoursFormValues, parseHoursForm } from "@/lib/domain/hours";
import { newPersonSchema, switchOffWarning, timeOffSchema, timeOffWarning, USERNAME_RULE } from "@/lib/domain/team";

const ID = "10000000-0000-4000-8000-000000000003";
const form = (fields: Record<string, string>) => (name: string) => fields[name] ?? null;

describe("weekly hours form", () => {
  it("days switched on become HH:MM windows; the rest are closed", () => {
    const r = parseHoursForm(form({ day_1_on: "on", day_1_open: "540", day_1_close: "1050", day_6_on: "on", day_6_open: "510", day_6_close: "1080" }));
    expect(r).toEqual({
      ok: true,
      hours: { "1": { open: "09:00", close: "17:30" }, "2": null, "3": null, "4": null, "5": null, "6": { open: "08:30", close: "18:00" }, "7": null },
    });
  });

  it("finish must be after start; times must be on the 5-minute grid", () => {
    expect(parseHoursForm(form({ day_2_on: "on", day_2_open: "600", day_2_close: "600" }))).toEqual({ ok: false, errors: { day_2: HOURS_ORDER_ERROR } });
    expect(parseHoursForm(form({ day_3_on: "on", day_3_open: "601", day_3_close: "900" }))).toMatchObject({ ok: false });
    expect(parseHoursForm(form({ day_3_on: "on", day_3_open: "x", day_3_close: "900" }))).toMatchObject({ ok: false });
  });

  it("form values round trip, closed days default to 9–5 when switched on", () => {
    const values = hoursFormValues({ "1": { open: "10:00", close: "18:00" } });
    expect(values[0]).toEqual({ day: "1", on: true, open: 600, close: 1080 });
    expect(values[6]).toEqual({ day: "7", on: false, open: 540, close: 1020 });
  });
});

describe("new person", () => {
  it("usernames are case-insensitive and validated; names tidied", () => {
    expect(newPersonSchema.parse({ username: "  Jo.Smith ", displayName: "  Jo   Smith ", role: "barber" })).toEqual({
      username: "jo.smith", displayName: "Jo Smith", role: "barber",
    });
    const bad = newPersonSchema.safeParse({ username: "jo smith", displayName: "Jo", role: "barber" });
    expect(bad.error?.issues[0]).toMatchObject({ path: ["username"], message: USERNAME_RULE });
    expect(newPersonSchema.safeParse({ username: "jo", displayName: "Jo", role: "barber" }).success).toBe(false);
    expect(newPersonSchema.safeParse({ username: "jos", displayName: "Jo", role: "boss" }).success).toBe(false);
  });
});

describe("time off", () => {
  it("first and last day, last not before first, short optional reason", () => {
    expect(timeOffSchema.parse({ staffId: ID, startsOn: "2026-12-01", endsOn: "2026-12-03", reason: "  Holiday ", anyway: "0" })).toEqual({
      staffId: ID, startsOn: "2026-12-01", endsOn: "2026-12-03", reason: "Holiday", anyway: false,
    });
    const back = timeOffSchema.safeParse({ staffId: ID, startsOn: "2026-12-03", endsOn: "2026-12-01", anyway: "0" });
    expect(back.error?.issues[0]).toMatchObject({ path: ["endsOn"] });
    expect(timeOffSchema.safeParse({ staffId: ID, startsOn: "2026-12-01", endsOn: "2026-12-01", reason: "x".repeat(101), anyway: "1" }).success).toBe(false);
  });

  it("warnings count the bookings that stay", () => {
    expect(timeOffWarning(0)).toBeNull();
    expect(timeOffWarning(1)).toBe("1 booking falls inside these dates. It stays booked: move or cancel it from the Calendar.");
    expect(timeOffWarning(3)).toMatch(/^3 bookings fall .* They stay booked: move or cancel them/);
    expect(switchOffWarning("Sam", 0)).toBeNull();
    expect(switchOffWarning("Sam", 2)).toMatch(/^Sam has 2 upcoming bookings\. They stay booked/);
  });
});
