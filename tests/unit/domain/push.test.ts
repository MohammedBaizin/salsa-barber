import { createECDH, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isAllowedPushEndpoint, pushMessage, pushRecipients, TEST_PUSH } from "@/lib/domain/push";
import { decryptPayload, encryptPayload, generateVapidKeys, sendPush, vapidAuthorization, verifyVapid } from "@/lib/push/web-push";

function browserKeys() {
  const ecdh = createECDH("prime256v1");
  const publicKey = ecdh.generateKeys();
  const auth = randomBytes(16);
  return {
    receiver: { privateKey: ecdh.getPrivateKey(), publicKey, auth },
    subscription: { p256dh: publicKey.toString("base64url"), auth: auth.toString("base64url") },
  };
}

describe("push: who gets alerts", () => {
  const people = [
    { id: "a", role: "admin" as const, active: true, deleted: false },
    { id: "o", role: "owner" as const, active: true, deleted: false },
    { id: "sam", role: "barber" as const, active: true, deleted: false },
    { id: "jamie", role: "barber" as const, active: true, deleted: false },
    { id: "off", role: "barber" as const, active: false, deleted: false },
    { id: "gone", role: "owner" as const, active: true, deleted: true },
  ];
  it("admin and owner always; a barber only for their own bookings; never switched-off or deleted", () => {
    expect(pushRecipients(people, "jamie")).toEqual(["a", "o", "jamie"]);
    expect(pushRecipients(people, "off")).toEqual(["a", "o"]);
  });
});

describe("push: text", () => {
  const b = { name: "Jo\nBloggs", serviceName: "Skin Fade", barberName: "Sam", startsAt: new Date("2026-11-20T16:00:00Z") };
  it("request, change (with the old time) and cancel; never a phone number", () => {
    expect(pushMessage("request", b)).toMatchObject({ title: "New booking request", body: "Jo Bloggs · Skin Fade with Sam · Fri 20 Nov, 4:00pm", url: "/dashboard" });
    expect(pushMessage("change", { ...b, previousStartsAt: new Date("2026-11-19T10:30:00Z") }).body).toBe(
      "Jo Bloggs · Skin Fade with Sam · Fri 20 Nov, 4:00pm (was Thu 19 Nov, 10:30am)",
    );
    expect(pushMessage("cancel", b)).toMatchObject({ title: "Booking cancelled by the customer", url: "/dashboard/calendar?date=2026-11-20" });
    for (const kind of ["request", "change", "cancel"] as const) expect(JSON.stringify(pushMessage(kind, b))).not.toMatch(/\+44|07\d{3}/);
  });
});

describe("push: allowed services", () => {
  it("only real browser push services (plus the test stand-in when configured)", () => {
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(isAllowedPushEndpoint("https://web.push.apple.com/QG9")).toBe(true);
    expect(isAllowedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/x")).toBe(true);
    expect(isAllowedPushEndpoint("https://wns2-db5p.notify.windows.com/w/?token=x")).toBe(true);
    expect(isAllowedPushEndpoint("https://evil.example/fcm.googleapis.com/")).toBe(false);
    expect(isAllowedPushEndpoint("http://fcm.googleapis.com/fcm/send/abc")).toBe(false);
    expect(isAllowedPushEndpoint("not a url")).toBe(false);
    expect(isAllowedPushEndpoint("http://127.0.0.1:3419/push/x")).toBe(false);
    expect(isAllowedPushEndpoint("http://127.0.0.1:3419/push/x", "http://127.0.0.1:3419")).toBe(true);
  });
});

describe("web push encryption and VAPID", () => {
  it("round trip: what the server encrypts, the browser's keys decrypt", () => {
    const { receiver, subscription } = browserKeys();
    const text = JSON.stringify(TEST_PUSH);
    const message = encryptPayload(text, subscription);
    expect(message.readUInt32BE(16)).toBe(4096);
    expect(decryptPayload(message, receiver)).toBe(text);
    // A different browser can't read it.
    expect(() => decryptPayload(message, browserKeys().receiver)).toThrow();
  });

  it("VAPID: signed for the push service's origin, verifiable with the public key, 12 hours", () => {
    const keys = { ...generateVapidKeys(), subject: "mailto:alerts@example.invalid" };
    const now = Date.UTC(2026, 10, 20, 12);
    const header = vapidAuthorization("https://fcm.googleapis.com/fcm/send/abc", keys, now);
    expect(verifyVapid(header, keys.publicKey)).toEqual({ aud: "https://fcm.googleapis.com", exp: now / 1000 + 12 * 3600, sub: "mailto:alerts@example.invalid" });
    expect(verifyVapid(header, generateVapidKeys().publicKey)).toBeNull();
  });

  it("send: headers, gone subscriptions (404/410), failures never throw", async () => {
    const keys = { ...generateVapidKeys(), subject: "mailto:alerts@example.invalid" };
    const { receiver, subscription } = browserKeys();
    const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", ...subscription };
    let seen: RequestInit | null = null;
    expect(
      await sendPush(sub, "hello", keys, async (_url, init) => {
        seen = init;
        return new Response(null, { status: 201 });
      }),
    ).toBe("sent");
    const init = seen as unknown as { headers: Record<string, string>; body: Uint8Array };
    expect(init.headers).toMatchObject({ "Content-Encoding": "aes128gcm", TTL: "86400", Urgency: "high" });
    expect(decryptPayload(Buffer.from(init.body), receiver)).toBe("hello");
    expect(await sendPush(sub, "x", keys, async () => new Response(null, { status: 410 }))).toBe("gone");
    expect(await sendPush(sub, "x", keys, async () => new Response(null, { status: 500 }))).toBe("failed");
    expect(await sendPush(sub, "x", keys, async () => Promise.reject(new TypeError("offline")))).toBe("failed");
  });
});
