import { createECDH, randomBytes } from "node:crypto";
import http from "node:http";
import { expect, test, type Page } from "@playwright/test";
import { TEST_PUSH } from "../../src/lib/domain/push";
import { decryptPayload, verifyVapid } from "../../src/lib/push/web-push";
import { signInAs } from "./dashboard-helpers";
import { expectAccessible, setTheme, sql } from "./helpers";

/**
 * Booking alerts (spec §10, §11) against a local stand-in push service on port 3419 (playwright.config.ts points
 * the server at it). The browser's push subscription is faked with keys the test holds, so the test can decrypt
 * exactly what the server sent. Test phones: 07700 9008xx.
 */
const ORIGIN = "http://127.0.0.1:3419";
const PHONE_LIKE = "+4477009008%";

type Received = { path: string; headers: http.IncomingHttpHeaders; body: Buffer };
const received: Received[] = [];
let server: http.Server;

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      received.push({ path: req.url ?? "", headers: req.headers, body: Buffer.concat(chunks) });
      res.writeHead(req.url?.startsWith("/push/gone") ? 410 : 201).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(3419, "127.0.0.1", resolve));
});
test.afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
test.afterEach(async () => {
  received.length = 0;
  await sql(`delete from public.push_subscriptions where endpoint like '${ORIGIN}/%'`);
  await sql(`delete from public.bookings where client_id in (select id from public.clients where phone like '${PHONE_LIKE}')`);
  await sql(`delete from public.clients where phone like '${PHONE_LIKE}'`);
  await sql("delete from public.request_attempts");
});

/** A browser's push keys (the test keeps the private half to read what arrives). */
function deviceKeys() {
  const ecdh = createECDH("prime256v1");
  const publicKey = ecdh.generateKeys();
  const auth = randomBytes(16);
  return { receiver: { privateKey: ecdh.getPrivateKey(), publicKey, auth }, p256dh: publicKey.toString("base64url"), auth: auth.toString("base64url") };
}

/**
 * Fakes the browser's push subscription and notification permission (headless browsers can't reach a real push
 * service, and report notifications as blocked). Asking for permission answers `permission`.
 */
async function fakePush(page: Page, endpoint: string, keys: { p256dh: string; auth: string }, permission: NotificationPermission = "granted") {
  await page.addInitScript(
    ({ endpoint, p256dh, auth, permission }) => {
      const fake = {
        endpoint,
        expirationTime: null,
        options: {},
        getKey: () => null,
        toJSON: () => ({ endpoint, expirationTime: null, keys: { p256dh, auth } }),
        unsubscribe: async () => {
          localStorage.removeItem("fake-push");
          return true;
        },
      };
      PushManager.prototype.getSubscription = async () => (localStorage.getItem("fake-push") ? (fake as unknown as PushSubscription) : null);
      PushManager.prototype.subscribe = async () => {
        localStorage.setItem("fake-push", "1");
        return fake as unknown as PushSubscription;
      };
      // Before asking, a "granted" browser still reads as "default" (as a fresh browser would).
      let current: NotificationPermission = permission === "granted" ? "default" : permission;
      Object.defineProperty(Notification, "permission", { get: () => current });
      Notification.requestPermission = async () => (current = permission);
    },
    { endpoint, ...keys, permission },
  );
}

const pushesTo = (path: string) => received.filter((r) => r.path === path);

test.describe("booking alerts", () => {
  test("Account: turn on, send a test (encrypted, signed), turn off", async ({ page }) => {
    const keys = deviceKeys();
    await fakePush(page, `${ORIGIN}/push/owner-account`, keys);
    await signInAs(page, "owner");
    await page.goto("/dashboard/account");
    const card = page.getByRole("region", { name: "Booking alerts on this device" });
    await card.getByRole("button", { name: "Turn on booking alerts" }).click();
    await expect(page.getByTestId("toast")).toHaveText("Booking alerts are on for this device.");
    await expect(card).toContainText("On for this device");
    const [row] = await sql("select s.username from public.push_subscriptions p join public.staff s on s.user_id = p.user_id where p.endpoint = $1", [
      `${ORIGIN}/push/owner-account`,
    ]);
    expect(row.username).toBe("owner");

    await card.getByRole("button", { name: "Send a test" }).click();
    await expect.poll(() => pushesTo("/push/owner-account").length).toBe(1);
    const push = pushesTo("/push/owner-account")[0];
    expect(push.headers["content-encoding"]).toBe("aes128gcm");
    expect(verifyVapid(String(push.headers.authorization), process.env.E2E_VAPID_PUBLIC_KEY!)).toMatchObject({ aud: ORIGIN });
    expect(JSON.parse(decryptPayload(push.body, keys.receiver))).toEqual(TEST_PUSH);

    await card.getByRole("button", { name: "Turn off" }).click();
    await expect(page.getByTestId("toast")).toHaveText("Booking alerts are off for this device.");
    expect(await sql("select 1 from public.push_subscriptions where endpoint like $1", [`${ORIGIN}/%`])).toEqual([]);
  });

  test("a customer's request alerts the owner, admin and that barber only; never the phone number; gone devices removed", async ({ page }) => {
    const owner = deviceKeys();
    const jamie = deviceKeys();
    const any = deviceKeys();
    await sql(
      `insert into public.push_subscriptions (endpoint, user_id, p256dh, auth)
       select $1 || '/push/' || v.path, s.user_id, case when v.path = 'owner' then $2 when v.path = 'jamie' then $3 else $4 end, case when v.path = 'owner' then $5 when v.path = 'jamie' then $6 else $7 end
       from (values ('owner', 'owner'), ('jamie', 'jamie'), ('sam', 'sam'), ('gone', 'admin')) v(path, username)
       join public.staff s on s.username = v.username`,
      [ORIGIN, owner.p256dh, jamie.p256dh, any.p256dh, owner.auth, jamie.auth, any.auth],
    );
    // A switched-off account's old device.
    await sql(
      `insert into public.push_subscriptions (endpoint, user_id, p256dh, auth)
       select $1, user_id, $2, $3 from public.staff where id = '10000000-0000-4000-8000-000000000005' and user_id is not null`,
      [`${ORIGIN}/push/off`, any.p256dh, any.auth],
    );

    await page.goto("/book");
    await page.getByRole("button", { name: /^Hair Cut(\s|$)/ }).click();
    await page.getByRole("button", { name: /SAMPLE Jamie/ }).click();
    await page.getByTestId("times").getByRole("button").first().click();
    await page.getByLabel("Your name").fill("E2E Push");
    await page.getByLabel("Mobile number").fill("07700 900811");
    await page.getByRole("button", { name: "Send booking request" }).click();
    await expect(page).toHaveURL(/\/booking\/[0-9a-f-]{36}$/);

    await expect.poll(() => pushesTo("/push/owner").length).toBe(1);
    await expect.poll(() => pushesTo("/push/jamie").length).toBe(1);
    await expect.poll(() => pushesTo("/push/gone").length).toBe(1);
    const alert = JSON.parse(decryptPayload(pushesTo("/push/owner")[0].body, owner.receiver));
    expect(alert.title).toBe("New booking request");
    expect(alert.body).toMatch(/^E2E Push · Hair Cut with SAMPLE Jamie · \w{3} \d{1,2} \w{3}, \d{1,2}:\d{2}[ap]m$/);
    expect(alert.url).toBe("/dashboard");
    expect(JSON.stringify(alert)).not.toContain("07700");
    expect(JSON.parse(decryptPayload(pushesTo("/push/jamie")[0].body, jamie.receiver)).body).toBe(alert.body);
    expect(pushesTo("/push/sam")).toEqual([]);
    expect(pushesTo("/push/off")).toEqual([]);
    // The push service said the admin's old device is gone: it's removed.
    await expect.poll(async () => (await sql("select 1 from public.push_subscriptions where endpoint = $1", [`${ORIGIN}/push/gone`])).length).toBe(0);
  });

  test("signing out stops alerts on this device", async ({ page }) => {
    await fakePush(page, `${ORIGIN}/push/sign-out`, deviceKeys());
    await signInAs(page, "sam");
    await page.goto("/dashboard/account");
    await page.getByRole("button", { name: "Turn on booking alerts" }).click();
    await expect(page.getByTestId("toast")).toHaveText("Booking alerts are on for this device.");
    expect(await sql("select 1 from public.push_subscriptions where endpoint = $1", [`${ORIGIN}/push/sign-out`])).toHaveLength(1);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);
    expect(await sql("select 1 from public.push_subscriptions where endpoint = $1", [`${ORIGIN}/push/sign-out`])).toEqual([]);
  });

  test("only real push services are accepted", async ({ page }) => {
    await fakePush(page, "https://evil.example/push/x", deviceKeys());
    await signInAs(page, "owner");
    await page.goto("/dashboard/account");
    await page.getByRole("button", { name: "Turn on booking alerts" }).click();
    await expect(page.getByRole("region", { name: "Booking alerts on this device" }).getByRole("alert")).toContainText("isn't supported");
    expect(await sql("select 1 from public.push_subscriptions where endpoint like 'https://evil.example%'")).toEqual([]);
  });

  test("installed app: the notifications bar until alerts are on; Not now hides it for this session", async ({ page }) => {
    await page.addInitScript(() => {
      const real = window.matchMedia.bind(window);
      window.matchMedia = (q: string) => (q.includes("display-mode: standalone") ? ({ ...real(q), matches: true, media: q } as MediaQueryList) : real(q));
    });
    await fakePush(page, `${ORIGIN}/push/bar`, deviceKeys(), "default");
    await signInAs(page, "owner");
    const bar = page.getByTestId("notifications-bar");
    await expect(bar).toContainText("Get an alert on this phone");
    await expect(page.getByTestId("alerts-offer")).toHaveCount(0); // the installed app gets the bar, not the offer
    await bar.getByRole("button", { name: "Not now" }).click();
    await expect(bar).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId("greeting")).toBeVisible();
    await expect(bar).toHaveCount(0);
  });

  test("blocked alerts: the bar explains how to fix it", async ({ page }) => {
    await page.addInitScript(() => {
      const real = window.matchMedia.bind(window);
      window.matchMedia = (q: string) => (q.includes("display-mode: standalone") ? ({ ...real(q), matches: true, media: q } as MediaQueryList) : real(q));
    });
    await fakePush(page, `${ORIGIN}/push/blocked`, deviceKeys(), "denied");
    await signInAs(page, "owner");
    const bar = page.getByTestId("notifications-bar");
    await expect(bar).toContainText("Booking alerts are blocked on this device.");
    await bar.getByText("How to fix").click();
    await expect(bar).toContainText("Allow Notifications");
    await expect(bar.getByRole("button", { name: "Turn on" })).toHaveCount(0);
  });

  test("Today: a one-time offer in a browser that can show alerts", async ({ page }) => {
    await fakePush(page, `${ORIGIN}/push/offer`, deviceKeys(), "default");
    await signInAs(page, "owner");
    const offer = page.getByTestId("alerts-offer");
    await expect(offer).toBeVisible();
    await expect(page.getByTestId("notifications-bar")).toHaveCount(0);
    await offer.getByRole("button", { name: "No thanks" }).click();
    await expect(offer).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId("greeting")).toBeVisible();
    await expect(offer).toHaveCount(0);
  });

  test("app files: staff-only manifest with shortcuts; the service worker never caches and is always re-checked", async ({ page, request }) => {
    const manifest = await (await request.get("/dashboard.webmanifest")).json();
    expect(manifest).toMatchObject({ id: "/dashboard", start_url: "/dashboard", display: "standalone", name: "Salsa Dashboard" });
    expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    const sw = await request.get("/sw.js");
    expect(sw.headers()["cache-control"]).toBe("no-cache");
    const code = await sw.text();
    expect(code).toContain('addEventListener("push"');
    // The offline screen is built into the worker; nothing goes into the Cache Storage.
    expect(code).not.toContain("caches.");
    expect(manifest.shortcuts.map((s: { url: string }) => s.url)).toEqual(["/dashboard?new=walk_in", "/dashboard?new=phone", "/dashboard/calendar", "/dashboard/clients"]);

    await page.goto("/");
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(0);
    await page.goto("/login");
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/dashboard.webmanifest");
    await expect(page.locator('meta[name="mobile-web-app-capable"], meta[name="apple-mobile-web-app-capable"]').first()).toHaveAttribute("content", "yes");
  });

  for (const theme of ["light", "dark"] as const) {
    test(`WCAG 2.1 AA: alerts card, bar and offer (${theme})`, async ({ page }) => {
      await page.addInitScript(() => {
        const real = window.matchMedia.bind(window);
        window.matchMedia = (q: string) => (q.includes("display-mode: standalone") ? ({ ...real(q), matches: true, media: q } as MediaQueryList) : real(q));
      });
      await setTheme(page, "dashboard", theme);
      await fakePush(page, `${ORIGIN}/push/a11y`, deviceKeys(), "default");
      await signInAs(page, "owner");
      await expect(page.getByTestId("notifications-bar")).toBeVisible();
      await page.goto("/dashboard/account");
      await expect(page.getByRole("button", { name: "Turn on booking alerts" })).toBeVisible();
      await expectAccessible(page);
    });
  }
});
