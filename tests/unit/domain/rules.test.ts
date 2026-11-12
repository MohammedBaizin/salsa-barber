import { describe, expect, it } from "vitest";
import { actionLabel, ACTION_LABELS, activityType, describeChanged, groupByDay } from "@/lib/domain/activity";
import {
  bookAgainDefaults, clientLabels, escapeLike, phoneSearchFragment, safeClientsBackLink, sortClients, type ClientStats,
} from "@/lib/domain/clients";
import { formatDuration, moveItem, serviceInputSchema, sortServices } from "@/lib/domain/services";
import { bookingRulesSchema, closureSchema, googleSchema, noticeLabel, websiteNotesSchema } from "@/lib/domain/settings";
import {
  can, canChangeRole, canDelete, canEditPerson, canReset2fa, canResetPassword, canSwitchOff, creatableRoles, initials, loginEmail,
  usernameSchema, visibleToActor,
} from "@/lib/domain/team";
import { dateKey, formatTime, fromLondon } from "@/lib/domain/time";

const admin = { id: "a", role: "admin" as const };
const admin2 = { id: "a2", role: "admin" as const };
const owner = { id: "o", role: "owner" as const };
const owner2 = { id: "o2", role: "owner" as const };
const sam = { id: "s", role: "barber" as const };
const jamie = { id: "j", role: "barber" as const };

describe("team permissions (spec §7)", () => {
  it("shop-wide permissions by role", () => {
    expect(can(owner, "services.edit")).toBe(true);
    expect(can(owner, "settings.edit")).toBe(true);
    expect(can(owner, "backup")).toBe(false);
    expect(can(owner, "team.view_admins")).toBe(false);
    expect(can(owner, "activity.view_admin_entries")).toBe(false);
    expect(can(admin, "backup")).toBe(true);
    expect(can(sam, "services.edit")).toBe(false);
    expect(can(sam, "clients.edit")).toBe(false);
    expect(can(sam, "revenue.shop")).toBe(false);
  });

  it("who can create which roles", () => {
    expect(creatableRoles(admin)).toEqual(["barber", "owner", "admin"]);
    expect(creatableRoles(owner)).toEqual(["barber"]);
    expect(creatableRoles(sam)).toEqual([]);
  });

  it("editing people", () => {
    expect(canEditPerson(owner, sam)).toBe(true);
    expect(canEditPerson(owner, owner)).toBe(true);
    expect(canEditPerson(owner, owner2)).toBe(false);
    expect(canEditPerson(owner, admin)).toBe(false);
    expect(canEditPerson(admin, owner)).toBe(true);
    expect(canEditPerson(sam, sam)).toBe(false);
  });

  it("password and two-step resets", () => {
    expect(canResetPassword(owner, sam)).toBe(true);
    expect(canResetPassword(owner, owner2)).toBe(false);
    expect(canResetPassword(admin, owner)).toBe(true);
    expect(canResetPassword(admin, admin)).toBe(false);
    expect(canReset2fa(admin, owner)).toBe(true);
    expect(canReset2fa(owner, sam)).toBe(false);
    expect(canReset2fa(admin, admin)).toBe(false);
  });

  it("nobody switches off or deletes themselves; deleting needs no upcoming bookings", () => {
    expect(canSwitchOff(owner, owner)).toBe(false);
    expect(canSwitchOff(owner, sam)).toBe(true);
    expect(canSwitchOff(owner, admin)).toBe(false);
    expect(canSwitchOff(admin, admin2)).toBe(true);
    expect(canDelete(owner, sam, 0)).toBe(true);
    expect(canDelete(owner, sam, 2)).toBe(false);
    expect(canDelete(owner, owner2, 0)).toBe(false);
    expect(canDelete(sam, jamie, 0)).toBe(false);
  });

  it("roles change only by admin, never their own; admin rows only for admins", () => {
    expect(canChangeRole(admin, owner)).toBe(true);
    expect(canChangeRole(admin, admin)).toBe(false);
    expect(canChangeRole(owner, sam)).toBe(false);
    expect(visibleToActor(owner, admin)).toBe(false);
    expect(visibleToActor(admin, admin2)).toBe(true);
    expect(visibleToActor(sam, owner)).toBe(true);
  });

  it("usernames are case-insensitive and validated", () => {
    expect(usernameSchema.parse("  Sam.Smith ")).toBe("sam.smith");
    expect(usernameSchema.safeParse("jo").success).toBe(false);
    expect(usernameSchema.safeParse("sam smith").success).toBe(false);
    expect(loginEmail("Sam")).toBe("sam@staff.salsabarber.invalid");
  });

  it("initials", () => {
    expect(initials("Sam")).toBe("S");
    expect(initials("sam de la cruz")).toBe("SC");
    expect(initials("  ")).toBe("?");
  });
});

describe("clients", () => {
  const now = new Date("2026-11-12T12:00:00Z");
  const stats = (over: Partial<ClientStats>): ClientStats => ({
    visits: 0, spentPence: 0, noShows: 0, lastVisit: null, nextVisit: null, usualServiceId: null, usualStaffId: null, usualStartMinute: null,
    ...over,
  });
  const weeksAgo = (w: number) => new Date(now.getTime() - w * 7 * 86_400_000);

  it("derives labels", () => {
    expect(clientLabels(stats({ visits: 0 }), now, 5)).toEqual(["new"]);
    expect(clientLabels(stats({ visits: 3, lastVisit: weeksAgo(2) }), now, 5)).toEqual(["regular"]);
    expect(clientLabels(stats({ visits: 4, lastVisit: weeksAgo(6) }), now, 5)).toEqual(["regular", "due_back"]);
    expect(clientLabels(stats({ visits: 1, lastVisit: weeksAgo(6), nextVisit: now }), now, 5)).toEqual([]);
    expect(clientLabels(stats({ visits: 1, lastVisit: weeksAgo(4.9) }), now, 5)).toEqual([]);
  });

  it("sorts usefully per filter", () => {
    const rows = [
      { name: "bob", createdAt: new Date("2026-01-01"), stats: stats({ visits: 2, lastVisit: weeksAgo(10) }) },
      { name: "Al", createdAt: new Date("2026-06-01"), stats: stats({ visits: 9, lastVisit: weeksAgo(6) }) },
      { name: "cy", createdAt: new Date("2026-03-01"), stats: stats({ visits: 0 }) },
    ];
    expect(sortClients(rows, "all").map((r) => r.name)).toEqual(["Al", "bob", "cy"]);
    expect(sortClients(rows, "regular").map((r) => r.name)).toEqual(["Al", "bob", "cy"]);
    expect(sortClients(rows, "due_back").map((r) => r.name)).toEqual(["cy", "bob", "Al"]);
    expect(sortClients(rows, "new").map((r) => r.name)).toEqual(["Al", "cy", "bob"]);
  });

  it("phone searches typed any way", () => {
    expect(phoneSearchFragment("07123 45")).toBe("712345");
    expect(phoneSearchFragment("+44 7123")).toBe("7123");
    expect(phoneSearchFragment("447123456789")).toBe("7123456789");
    expect(phoneSearchFragment("7123")).toBe("7123");
    expect(phoneSearchFragment("Ben")).toBeNull();
    expect(phoneSearchFragment("07")).toBeNull();
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
  });

  it("back links only go to the clients list", () => {
    expect(safeClientsBackLink("/dashboard/clients?filter=due_back&page=2")).toBe("/dashboard/clients?filter=due_back&page=2");
    expect(safeClientsBackLink("https://evil.example/")).toBe("/dashboard/clients");
    expect(safeClientsBackLink("//evil.example")).toBe("/dashboard/clients");
    expect(safeClientsBackLink("/dashboard/team")).toBe("/dashboard/clients");
    expect(safeClientsBackLink(null)).toBe("/dashboard/clients");
  });

  it("book-again defaults: usual service and time, 3 weeks ahead", () => {
    const d = bookAgainDefaults({ usualServiceId: "svc", usualStaffId: "sam", usualStartMinute: 10 * 60 + 32 }, now);
    expect(d).toMatchObject({ serviceId: "svc", staffId: "sam", date: "2026-12-03", minute: 630 });
    expect(formatTime(d.start)).toBe("10:30am");
    expect(dateKey(d.start)).toBe("2026-12-03");
    expect(bookAgainDefaults({ usualServiceId: null, usualStaffId: null, usualStartMinute: null }, now).minute).toBe(600);
  });
});

describe("services", () => {
  it("parses the edit form", () => {
    expect(serviceInputSchema.parse({ name: " Skin  Fade ", price: "£18.50", durationMin: "45" })).toEqual({
      name: "Skin Fade", price: 1850, durationMin: 45,
    });
    expect(serviceInputSchema.safeParse({ name: "x", price: "18", durationMin: "47" }).success).toBe(false);
    expect(serviceInputSchema.safeParse({ name: "x", price: "18", durationMin: "245" }).success).toBe(false);
    expect(serviceInputSchema.safeParse({ name: "x", price: "1001", durationMin: "30" }).success).toBe(false);
    expect(serviceInputSchema.safeParse({ name: "", price: "1", durationMin: "30" }).success).toBe(false);
  });

  it("durations, sorting and reordering", () => {
    expect(formatDuration(90)).toBe("1 hr 30 min");
    expect(sortServices([{ sort: 2, name: "b" }, { sort: 1, name: "z" }, { sort: 1, name: "a" }]).map((s) => s.name)).toEqual(["a", "z", "b"]);
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(moveItem(items, "c", -1)).toEqual([{ id: "a", sort: 10 }, { id: "c", sort: 20 }, { id: "b", sort: 30 }]);
    expect(moveItem(items, "a", -1).map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
});

describe("settings", () => {
  it("booking rules use the allowed choices and ranges", () => {
    expect(bookingRulesSchema.safeParse({ minNoticeMinutes: "120", bookingWindowDays: "30", dueBackWeeks: "5", maxOpenRequests: "3", changeCutoffMinutes: "120" }).success).toBe(true);
    expect(bookingRulesSchema.safeParse({ minNoticeMinutes: "90", bookingWindowDays: "30", dueBackWeeks: "5", maxOpenRequests: "3", changeCutoffMinutes: "120" }).success).toBe(false);
    expect(bookingRulesSchema.safeParse({ minNoticeMinutes: "120", bookingWindowDays: "366", dueBackWeeks: "5", maxOpenRequests: "3", changeCutoffMinutes: "120" }).success).toBe(false);
    expect(bookingRulesSchema.safeParse({ minNoticeMinutes: "120", bookingWindowDays: "30", dueBackWeeks: "5", maxOpenRequests: "21", changeCutoffMinutes: "120" }).success).toBe(false);
  });

  it("notice labels", () => {
    expect([0, 30, 60, 120, 720, 1440, 2880].map(noticeLabel)).toEqual([
      "No minimum", "30 minutes", "1 hour", "2 hours", "12 hours", "1 day", "2 days",
    ]);
  });

  it("Google rating: blank hides, https only", () => {
    expect(googleSchema.parse({ rating: "", count: "", url: "" })).toEqual({ rating: null, count: null, url: null });
    expect(googleSchema.parse({ rating: "4,86", count: "57", url: "https://g.page/r/x" })).toEqual({ rating: 4.9, count: 57, url: "https://g.page/r/x" });
    expect(googleSchema.safeParse({ rating: "6", count: "", url: "" }).success).toBe(false);
    expect(googleSchema.safeParse({ rating: "", count: "1.5", url: "" }).success).toBe(false);
    expect(googleSchema.safeParse({ rating: "", count: "", url: "http://g.page/x" }).success).toBe(false);
  });

  it("website notes: line breaks become spaces, blank hides, max 200", () => {
    expect(websiteNotesSchema.parse({ walkInText: "Walk-ins\nwelcome", discountText: "  " })).toEqual({ walkInText: "Walk-ins welcome", discountText: null });
    expect(websiteNotesSchema.safeParse({ walkInText: "x".repeat(201), discountText: "" }).success).toBe(false);
  });

  it("closed days need a real date", () => {
    expect(closureSchema.safeParse({ closedOn: "2026-12-25", reason: "Christmas" }).success).toBe(true);
    expect(closureSchema.safeParse({ closedOn: "2026-02-30" }).success).toBe(false);
  });
});

describe("activity log", () => {
  it("labels every action the audit trigger can write", () => {
    const fromTrigger = [
      "booking.create", "booking.walk_in", "booking.phone", "booking.accept", "booking.decline", "booking.cancel", "booking.done",
      "booking.no_show", "booking.undo", "booking.reassign", "booking.reschedule", "booking.service_change", "booking.update",
      "booking.delete", "service.create", "service.update", "service.disable", "service.enable", "service.delete", "staff.create",
      "staff.update", "staff.delete", "staff.role", "staff.switch_off", "staff.switch_on", "staff.hours", "staff.service_add",
      "staff.service_remove", "time_off.insert", "time_off.update", "time_off.delete", "closure.insert", "closure.update",
      "closure.delete", "settings.update", "client.insert", "client.update", "client.delete", "photo.insert", "photo.update",
      "photo.reorder", "photo.delete", "review.insert", "review.update", "review.reorder", "review.delete",
    ];
    for (const a of fromTrigger) {
      expect(ACTION_LABELS[a], a).toBeTruthy();
      expect(activityType(a), a).not.toBeNull();
    }
    expect(actionLabel("unknown.thing")).toBe("Unknown thing");
  });

  it("describes changed columns", () => {
    expect(describeChanged("service", ["price_pence", "duration_min"])).toBe("Changed price and length");
    expect(describeChanged("booking", ["service_id", "service_name", "price_pence"])).toBe("Changed service and price");
    expect(describeChanged("settings", ["shop_hours"])).toBe("Changed opening hours");
    expect(describeChanged("staff", null)).toBeNull();
  });

  it("groups newest first by London day", () => {
    const e = (iso: string) => ({ at: new Date(iso) });
    const groups = groupByDay([e("2026-07-01T10:00:00Z"), e("2026-07-01T23:30:00Z"), e("2026-07-01T22:00:00Z")]);
    expect(groups.map((g) => [g.date, g.entries.length])).toEqual([["2026-07-02", 1], ["2026-07-01", 2]]);
  });

  it("puts each action into one filter type", () => {
    expect(activityType("booking.accept")).toBe("bookings");
    expect(activityType("time_off.insert")).toBe("team");
    expect(activityType("account.2fa_reset")).toBe("team");
    expect(activityType("closure.insert")).toBe("settings");
    expect(activityType("review.update")).toBe("website");
  });
});

describe("London conversions used by these rules", () => {
  it("fromLondon is consistent with dateKey", () => {
    expect(dateKey(fromLondon("2026-12-03", 630))).toBe("2026-12-03");
  });
});
