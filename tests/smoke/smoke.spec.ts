import { expect, test } from "@playwright/test";

/** Read-only checks of a deployed site. See playwright.smoke.config.ts. */

const local = /localhost|127\.0\.0\.1/.test(process.env.SMOKE_URL ?? "");
const supabaseUrl = process.env.SMOKE_SUPABASE_URL?.replace(/\/$/, "");
const supabaseKey = process.env.SMOKE_SUPABASE_KEY;

test.describe("smoke", () => {
  test("health check", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers()["cache-control"]).toContain("no-store");
  });

  test("security headers on every response", async ({ request }) => {
    for (const path of ["/", "/book", "/login", "/robots.txt"]) {
      const h = (await request.get(path, { maxRedirects: 0 })).headers();
      expect(h["x-content-type-options"], path).toBe("nosniff");
      expect(h["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
      expect(h["x-frame-options"], path).toBe("DENY");
      expect(h["content-security-policy"], path).toContain("frame-ancestors 'none'");
      expect(h["permissions-policy"], path).toContain("camera=()");
      expect(h["x-powered-by"], path).toBeUndefined();
    }
  });

  test("homepage: loads, every image shows, no placeholder tags or sample data, honest structured data", async ({ page }) => {
    const res = await page.goto("/");
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator("[data-placeholder]")).toHaveCount(0);
    if (!local) await expect(page.locator("body")).not.toContainText("SAMPLE");

    // Scroll through the page so lazy images load, then check none is broken.
    for (let i = 0; i < 25; i++) {
      await page.mouse.wheel(0, 800);
      await page.waitForTimeout(120);
    }
    await page.waitForLoadState("networkidle");
    const broken = await page
      .locator("main img, header img")
      .evaluateAll((imgs) => (imgs as HTMLImageElement[]).filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.currentSrc || i.src));
    expect(broken).toEqual([]);

    const jsonLd = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent())!);
    expect(jsonLd["@type"]).toBe("BarberShop");
    expect(jsonLd.aggregateRating).toBeUndefined();
    expect(jsonLd.review).toBeUndefined();
  });

  test("booking page answers (the flow, or the call/WhatsApp panel when booking is off)", async ({ page }) => {
    const res = await page.goto("/book");
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Book a cut", level: 1 })).toBeVisible();
  });

  test("the dashboard sends signed-out visitors to sign in", async ({ page }) => {
    await page.goto("/dashboard/clients");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%2Fclients$/);
    await expect(page.getByRole("heading", { name: "Staff sign in" })).toBeVisible();
  });

  test("robots and sitemap", async ({ request, baseURL }) => {
    const robots = await (await request.get("/robots.txt")).text();
    for (const path of ["/dashboard", "/login", "/api", "/booking"]) expect(robots).toContain(`Disallow: ${path}`);
    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).toMatch(/\/book<\/loc>/);
    if (!local) expect(sitemap).toContain(new URL(baseURL!).host);
  });

  test("a made-up private booking link is not found, and never indexed", async ({ page }) => {
    // The page streams, so the "not found" arrives after the 200 status line: check what the visitor sees.
    await page.goto("/booking/00000000-0000-4000-8000-000000000000");
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
  });

  test("availability returns start times only", async ({ page, request }) => {
    await page.goto("/");
    const href = await page.locator('a[href^="/book?service="]').first().getAttribute("href");
    test.skip(!href, "No services on the price list.");
    const service = new URL(href!, "http://x").searchParams.get("service")!;
    const res = await request.get(`/api/availability?service=${service}`);
    test.skip(res.status() === 404, "Online booking is switched off.");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Object.keys(body)).toEqual(["days"]);
    expect(JSON.stringify(body)).not.toMatch(/\+44|07\d{3}|name|phone|client|staff|token/i);
    for (const day of body.days) {
      for (const t of day.times) expect(typeof t).toBe("string");
    }
  });

  test.describe("database (anon key)", () => {
    test.skip(!supabaseUrl || !supabaseKey, "Set SMOKE_SUPABASE_URL and SMOKE_SUPABASE_KEY for these checks.");
    const headers = () => ({ apikey: supabaseKey!, Authorization: `Bearer ${supabaseKey}` });

    test("sign-up is off", async ({ request }) => {
      const res = await request.post(`${supabaseUrl}/auth/v1/signup`, {
        headers: headers(),
        data: { email: `smoke-${Date.now()}@example.invalid`, password: "Smoke-test-not-a-real-account-1" },
      });
      expect(res.status()).toBeGreaterThanOrEqual(400);
      expect(await res.text()).toMatch(/signup|sign up|not allowed|disabled/i);
    });

    test("the public can't read bookings, clients, the activity log or usernames", async ({ request }) => {
      for (const table of ["bookings", "clients", "audit_log", "push_subscriptions", "login_failures"]) {
        const res = await request.get(`${supabaseUrl}/rest/v1/${table}?select=*&limit=1`, { headers: headers() });
        const rows = res.ok() ? await res.json() : [];
        expect(rows, table).toEqual([]);
      }
      const staff = await request.get(`${supabaseUrl}/rest/v1/staff?select=username&limit=5`, { headers: headers() });
      if (staff.ok()) expect((await staff.json()).every((r: { username?: string | null }) => !r.username)).toBe(true);
      const team = await request.get(`${supabaseUrl}/rest/v1/public_team?select=*&limit=5`, { headers: headers() });
      expect(team.ok()).toBe(true);
      for (const row of await team.json()) {
        expect(row).not.toHaveProperty("username");
        expect(row).not.toHaveProperty("weekly_hours");
        expect(row).not.toHaveProperty("user_id");
      }
    });
  });
});
