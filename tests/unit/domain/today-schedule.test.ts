import { describe, expect, it } from "vitest";
import { anywayLabel, checkStaffTime, scheduleWarnings } from "@/lib/domain/schedule";
import { fromLondon } from "@/lib/domain/time";
import {
  availableActions, canTransition, greeting, isExpired, isStale, needsClosing, nextUp, primaryAction, STATUS_TRANSITIONS,
  todayStats, untilLabel, type ActionBooking, type BookingStatus,
} from "@/lib/domain/today";

const at = (day: string, hhmm: string) => fromLondon(day, Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)));
const NOW = at("2026-11-12", "12:00");

function booking(over: Partial<ActionBooking> = {}): ActionBooking {
  return {
    status: "confirmed",
    staffId: "sam",
    startsAt: at("2026-11-12", "14:00"),
    endsAt: at("2026-11-12", "14:30"),
    createdAt: at("2026-11-12", "09:00"),
    hasPhone: true,
    ...over,
  };
}

const owner = { staffId: "own", role: "owner" as const };
const samActor = { staffId: "sam", role: "barber" as const };
const jamie = { staffId: "jamie", role: "barber" as const };

describe("status machine (mirrors the database trigger)", () => {
  it("matches the spec", () => {
    expect(STATUS_TRANSITIONS).toEqual({
      pending: ["confirmed", "declined", "cancelled"],
      confirmed: ["completed", "no_show", "cancelled"],
      completed: ["confirmed"],
      no_show: ["confirmed"],
      declined: [],
      cancelled: [],
    });
    expect(canTransition("completed", "confirmed")).toBe(true);
    expect(canTransition("pending", "completed")).toBe(false);
  });

  it("every action only leads to an allowed status", () => {
    const target: Partial<Record<string, BookingStatus>> = {
      accept: "confirmed", decline: "declined", done: "completed", no_show: "no_show", cancel: "cancelled", undo: "confirmed",
    };
    const statuses: BookingStatus[] = ["pending", "confirmed", "completed", "no_show", "declined", "cancelled"];
    for (const status of statuses) {
      for (const started of [false, true]) {
        const b = booking({ status, startsAt: started ? at("2026-11-12", "11:00") : at("2026-11-12", "14:00") });
        for (const action of availableActions(b, owner, NOW)) {
          const to = target[action];
          if (to) expect(canTransition(status, to), `${status} --${action}--> ${to}`).toBe(true);
        }
      }
    }
  });
});

describe("availableActions", () => {
  it("pending, not started: accept, decline, reschedule (+ manager changes)", () => {
    const b = booking({ status: "pending" });
    expect(availableActions(b, owner, NOW)).toEqual(["accept", "decline", "reschedule", "change_barber", "change_service"]);
    expect(availableActions(b, samActor, NOW)).toEqual(["accept", "decline", "reschedule"]);
  });

  it("pending and expired: decline only", () => {
    const b = booking({ status: "pending", startsAt: at("2026-11-12", "11:00") });
    expect(availableActions(b, owner, NOW)).toEqual(["decline"]);
    expect(isExpired(b, NOW)).toBe(true);
  });

  it("confirmed before / after it starts", () => {
    expect(availableActions(booking(), samActor, NOW)).toEqual(["message", "reschedule", "cancel"]);
    const started = booking({ startsAt: at("2026-11-12", "11:45"), endsAt: at("2026-11-12", "12:15") });
    expect(availableActions(started, samActor, NOW)).toEqual(["done", "no_show", "message", "reschedule", "cancel"]);
    expect(availableActions(booking({ hasPhone: false }), samActor, NOW)).not.toContain("message");
  });

  it("done and no-show can be undone; managers can still change the service once done", () => {
    expect(availableActions(booking({ status: "completed" }), owner, NOW)).toEqual(["undo", "change_service"]);
    expect(availableActions(booking({ status: "completed" }), samActor, NOW)).toEqual(["undo"]);
    expect(availableActions(booking({ status: "no_show" }), samActor, NOW)).toEqual(["undo"]);
  });

  it("declined / cancelled: only the message to send", () => {
    expect(availableActions(booking({ status: "declined" }), owner, NOW)).toEqual(["message"]);
    expect(availableActions(booking({ status: "cancelled", hasPhone: false }), owner, NOW)).toEqual([]);
  });

  it("barbers get nothing on other barbers' bookings", () => {
    expect(availableActions(booking(), jamie, NOW)).toEqual([]);
  });

  it("one primary action per card", () => {
    expect(primaryAction(booking({ status: "pending" }), owner, NOW)).toBe("accept");
    expect(primaryAction(booking(), owner, NOW)).toBeNull();
    expect(primaryAction(booking({ startsAt: at("2026-11-12", "11:45") }), owner, NOW)).toBe("done");
    expect(primaryAction(booking({ status: "pending" }), jamie, NOW)).toBeNull();
  });
});

describe("Today helpers", () => {
  it("flags requests older than 12 hours", () => {
    expect(isStale(booking({ status: "pending", createdAt: at("2026-11-11", "23:59") }), NOW)).toBe(true);
    expect(isStale(booking({ status: "pending", createdAt: at("2026-11-12", "00:01") }), NOW)).toBe(false);
    expect(isStale(booking({ status: "confirmed", createdAt: at("2026-11-01", "09:00") }), NOW)).toBe(false);
  });

  it("needs closing, next up and until labels", () => {
    const ended = booking({ startsAt: at("2026-11-12", "10:00"), endsAt: at("2026-11-12", "10:30") });
    const now = booking({ startsAt: at("2026-11-12", "11:50"), endsAt: at("2026-11-12", "12:20") });
    const later = booking({ startsAt: at("2026-11-12", "13:05"), endsAt: at("2026-11-12", "13:35") });
    const soon = booking({ startsAt: at("2026-11-12", "12:25"), endsAt: at("2026-11-12", "12:55") });
    expect(needsClosing([ended, now, later], NOW)).toEqual([ended]);
    expect(nextUp([later, ended, soon, now], NOW)).toEqual([now, soon, later]);
    expect(untilLabel(now, NOW)).toBe("Now");
    expect(untilLabel(soon, NOW)).toBe("in 25 min");
    expect(untilLabel(later, NOW)).toBe("in 1 hr 5 min");
    expect(untilLabel(ended, NOW)).toBeNull();
  });

  it("greets by London time", () => {
    expect(greeting(at("2026-11-12", "08:00"))).toBe("Good morning");
    expect(greeting(at("2026-11-12", "12:00"))).toBe("Good afternoon");
    expect(greeting(at("2026-11-12", "17:00"))).toBe("Good evening");
    expect(greeting(new Date("2026-07-01T11:30:00Z"))).toBe("Good afternoon"); // 12:30 BST
  });

  it("today's stats", () => {
    const s = todayStats(
      [
        { status: "completed", pricePence: 1700, startsAt: at("2026-11-12", "09:00") },
        { status: "confirmed", pricePence: 1800, startsAt: at("2026-11-12", "15:00") },
        { status: "cancelled", pricePence: 1400, startsAt: at("2026-11-12", "16:00") },
        { status: "pending", pricePence: 1400, startsAt: at("2026-11-12", "16:00") },
      ],
      NOW,
    );
    expect(s).toEqual({ bookings: 2, takenPence: 1700, expectedPence: 3500, upcoming: 1 });
  });
});

describe("schedule warnings for staff-chosen times", () => {
  const shopHours = { "4": { open: "09:00", close: "18:00" } }; // Thursdays only
  const base = {
    durationMin: 30,
    shopHours,
    closures: [] as string[],
    barberName: "Sam",
    barberHours: { "4": { open: "10:00", close: "16:00" } },
    timeOff: [] as { startsOn: string; endsOn: string }[],
  };

  it("no warnings inside every window", () => {
    expect(scheduleWarnings({ ...base, start: at("2026-11-12", "10:00") })).toEqual([]);
  });

  it("warns, never blocks", () => {
    expect(scheduleWarnings({ ...base, start: at("2026-11-13", "10:00") }).map((w) => w.code)).toEqual(["closed_day", "outside_barber_hours"]);
    expect(scheduleWarnings({ ...base, start: at("2026-11-12", "17:45") }).map((w) => w.code)).toEqual(["outside_shop_hours", "outside_barber_hours"]);
    expect(scheduleWarnings({ ...base, start: at("2026-11-12", "09:00") }).map((w) => w.code)).toEqual(["outside_barber_hours"]);
    expect(scheduleWarnings({ ...base, start: at("2026-11-12", "10:00"), closures: ["2026-11-12"] })[0].message).toBe(
      "The shop is closed on Thu 12 Nov.",
    );
    const off = scheduleWarnings({ ...base, start: at("2026-11-12", "10:00"), timeOff: [{ startsOn: "2026-11-10", endsOn: "2026-11-12" }] });
    expect(off).toEqual([{ code: "time_off", message: "Sam is off on Thu 12 Nov." }]);
  });

  it("button labels", () => {
    expect(anywayLabel("phone", true)).toBe("Book anyway");
    expect(anywayLabel("walk_in", true)).toBe("Save anyway");
    expect(anywayLabel("reschedule", true)).toBe("Move anyway");
    expect(anywayLabel("phone", false)).toBe("Book");
  });
});

describe("staff time rules", () => {
  it("5-minute grid", () => {
    expect(checkStaffTime("phone", at("2026-11-13", "10:03"), NOW)).toBe("not_on_grid");
    expect(checkStaffTime("phone", at("2026-11-13", "10:05"), NOW)).toBeNull();
  });

  it("walk-ins: from a week ago to the end of tomorrow", () => {
    expect(checkStaffTime("walk_in", at("2026-11-05", "09:00"), NOW)).toBeNull();
    expect(checkStaffTime("walk_in", at("2026-11-04", "23:55"), NOW)).toBe("walk_in_window");
    expect(checkStaffTime("walk_in", at("2026-11-13", "23:55"), NOW)).toBeNull();
    expect(checkStaffTime("walk_in", at("2026-11-14", "00:00"), NOW)).toBe("walk_in_window");
  });

  it("phone bookings and moves: future only, up to a year", () => {
    expect(checkStaffTime("phone", at("2026-11-12", "11:55"), NOW)).toBe("in_the_past");
    expect(checkStaffTime("reschedule", at("2027-11-12", "10:00"), NOW)).toBeNull();
    expect(checkStaffTime("phone", at("2027-11-13", "10:00"), NOW)).toBe("too_far");
  });
});
