import { afterEach, describe, expect, it, vi } from "vitest";
import { ownerAlertEmail } from "@/lib/domain/owner-alert";

vi.mock("server-only", () => ({}));

const shop = { name: "Salsa Barber", siteUrl: "https://salsa.example/" };
const base = {
  name: "Jo\nBloggs",
  serviceName: "Skin Fade",
  barberName: "Sam",
  anyBarber: false,
  startsAt: new Date("2026-11-20T16:00:00Z"),
};

describe("owner alert emails", () => {
  it("new request: name, service, barber and time; link to the dashboard; one-line name", () => {
    const e = ownerAlertEmail({ ...base, kind: "request", anyBarber: true }, shop);
    expect(e.subject).toBe("New booking request · Jo Bloggs · Skin Fade · Fri 20 Nov, 4:00pm");
    expect(e.text).toContain("Barber: Sam (any barber)");
    expect(e.text).toContain("Accept or decline it in the dashboard: https://salsa.example/dashboard");
  });

  it("change shows the old time; cancel says the time is free", () => {
    const change = ownerAlertEmail({ ...base, kind: "change", previousStartsAt: new Date("2026-11-19T10:30:00Z") }, shop);
    expect(change.subject).toMatch(/^Booking changed by the customer · /);
    expect(change.text).toContain("Was: Thu 19 Nov, 10:30am");
    const cancel = ownerAlertEmail({ ...base, kind: "cancel" }, shop);
    expect(cancel.subject).toMatch(/^Booking cancelled by the customer · /);
    expect(cancel.text).toContain("The time is free again. See the Calendar: https://salsa.example/dashboard/calendar");
  });

  it("never contains a phone number", () => {
    for (const kind of ["request", "change", "cancel"] as const) {
      const e = ownerAlertEmail({ ...base, kind }, shop);
      expect(`${e.subject}\n${e.text}`).not.toMatch(/\+?44\d|07\d{3}/);
    }
  });
});

describe("sending (Resend)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is off without both settings, and never throws", async () => {
    const { sendOwnerEmail } = await import("@/lib/email/owner-alert");
    const send = vi.fn();
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("OWNER_ALERT_EMAIL", "owner@example.test");
    expect(await sendOwnerEmail({ subject: "s", text: "t" }, send)).toBe("off");
    expect(send).not.toHaveBeenCalled();

    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sendOwnerEmail({ subject: "s", text: "t" }, vi.fn().mockRejectedValue(new TypeError("offline")))).toBe("failed");
    expect(await sendOwnerEmail({ subject: "s", text: "t" }, vi.fn().mockResolvedValue(new Response("", { status: 500 })))).toBe("failed");
  });

  it("posts a plain-text email to the owner", async () => {
    const { sendOwnerEmail } = await import("@/lib/email/owner-alert");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("OWNER_ALERT_EMAIL", "owner@example.test");
    vi.stubEnv("ALERT_FROM_EMAIL", "Alerts <alerts@salsa.example>");
    const send = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    expect(await sendOwnerEmail({ subject: "Subject", text: "Body" }, send)).toBe("sent");
    const [url, init] = send.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers).toMatchObject({ Authorization: "Bearer re_test" });
    expect(JSON.parse(init.body)).toEqual({ from: "Alerts <alerts@salsa.example>", to: ["owner@example.test"], subject: "Subject", text: "Body" });
  });
});
