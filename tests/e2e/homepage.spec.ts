import { expect, test } from "@playwright/test";
import { expectAccessible, expectNoHorizontalScroll, setTheme } from "./helpers";

test.describe("homepage", () => {
  test("shows the shop, live status, prices and every section", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Salsa Barber");
    await expect(page.getByTestId("open-status")).toHaveText(/^(Open now · closes|Closed)/);
    await expect(page.getByRole("link", { name: "Book a cut" }).first()).toHaveAttribute("href", "/book");

    const services = page.locator("#services li");
    await expect(services).toHaveCount(13);
    await expect(page.getByRole("link", { name: /^Hair Cut\s*£17/ })).toHaveAttribute("href", /\/book\?service=[0-9a-f-]{36}$/);
    await expect(page.getByRole("link", { name: /OAP Cut.*Mon–Thu only/ })).toBeVisible();

    for (const heading of ["Services & prices", "Recent cuts", "Inside the shop", "Visit us"]) {
      await expect(page.getByRole("heading", { level: 2, name: heading })).toBeVisible();
    }
    await expect(page.locator("#cuts li")).toHaveCount(4);
    await expect(page.locator('[aria-roledescription="slide"]')).toHaveCount(3);
    await expect(page.locator("#visit")).toContainText("Mon–Fri");
    await expect(page.locator("#visit")).toContainText("9:00am–6:30pm");
    await expect(page.locator("#visit")).toContainText("Walk-ins welcome.");
    await expect(page.getByRole("link", { name: "WhatsApp" })).toHaveAttribute("href", "https://wa.me/441513094681");
  });

  test("loads the shop photo and gallery images", async ({ page }) => {
    await page.goto("/");
    const hero = page.getByRole("img", { name: /shopfront/ });
    await expect(hero).toBeVisible();
    await expect.poll(() => hero.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    const cut = page.locator("#cuts img").first();
    await cut.scrollIntoViewIfNeeded();
    await expect.poll(() => cut.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  });

  test("has BarberShop structured data", async ({ page }) => {
    await page.goto("/");
    const json = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent())!);
    expect(json).toMatchObject({
      "@type": "BarberShop",
      name: "Salsa Barber",
      telephone: "+441513094681",
      address: { postalCode: "L31 7BN" },
    });
    expect(json.openingHoursSpecification).toHaveLength(7);
    expect(json.aggregateRating).toBeUndefined();
  });

  test("sends security headers", async ({ request }) => {
    const res = await request.get("/");
    expect(res.headers()["x-frame-options"]).toBe("DENY");
    expect(res.headers()["x-content-type-options"]).toBe("nosniff");
    expect(res.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(res.headers()["x-powered-by"]).toBeUndefined();
  });

  test("never shows placeholder tags in a production build", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("[data-placeholder]")).toHaveCount(0);
  });
});

test.describe("map", () => {
  test("Google Maps loads only after tapping Show map, and the choice is remembered", async ({ page }) => {
    const googleRequests: string[] = [];
    page.on("request", (r) => {
      if (/google\.com\/maps|maps\.googleapis|gstatic/.test(r.url())) googleRequests.push(r.url());
    });
    await page.goto("/");
    await page.locator("#visit").scrollIntoViewIfNeeded();
    await expect(page.getByTestId("map-preview")).toBeVisible();
    await page.waitForTimeout(500);
    expect(googleRequests).toEqual([]);

    await page.getByRole("button", { name: "Show map" }).click();
    await expect(page.getByTestId("map-embed")).toBeAttached();

    await page.reload();
    await page.locator("#visit").scrollIntoViewIfNeeded();
    await expect(page.getByTestId("map-embed")).toBeAttached();
  });
});

test.describe("recent cuts lightbox", () => {
  test("opens, moves with arrow keys, closes with Esc and returns focus", async ({ page }) => {
    await page.goto("/");
    const thumbs = page.locator("#cuts button");
    await thumbs.nth(1).click();
    const viewer = page.getByRole("dialog", { name: "Photo viewer" });
    await expect(viewer).toBeVisible();
    await expect(viewer.locator("figcaption")).toContainText("2 of 4");
    await page.keyboard.press("ArrowRight");
    await expect(viewer.locator("figcaption")).toContainText("3 of 4");
    await viewer.getByRole("button", { name: "Previous photo" }).click();
    await expect(viewer.locator("figcaption")).toContainText("2 of 4");
    await page.keyboard.press("Escape");
    await expect(viewer).toBeHidden();
    await expect(thumbs.nth(1)).toBeFocused();
  });
});

test.describe("slideshow", () => {
  test("autoplays and has working controls", async ({ page }) => {
    await page.clock.install();
    await page.goto("/");
    const slides = page.locator('[aria-roledescription="slide"]');
    await expect(slides.nth(0)).toHaveAttribute("aria-hidden", "false");
    await page.clock.runFor(6500);
    await expect(slides.nth(1)).toHaveAttribute("aria-hidden", "false");
    await page.getByRole("button", { name: "Next photo" }).first().click();
    await expect(slides.nth(2)).toHaveAttribute("aria-hidden", "false");
  });

  test("never autoplays with reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.clock.install();
    await page.goto("/");
    const slides = page.locator('[aria-roledescription="slide"]');
    await page.clock.runFor(20_000);
    await expect(slides.nth(0)).toHaveAttribute("aria-hidden", "false");
  });
});

test.describe("theme", () => {
  test("the toggle switches theme, updates theme-color and is remembered", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("salsa-site-theme", "light"));
    await page.reload();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    await page.getByRole("button", { name: "Switch to dark theme" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#141210");
    await page.goto("/book");
    await expect(page.locator("html")).toHaveClass(/dark/);
  });

  test("new visitors get the shop's default theme (dark)", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveClass(/dark/);
  });
});

test.describe("booking page while online booking is off", () => {
  test("offers Call and WhatsApp", async ({ page }) => {
    await page.goto("/book");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Book a cut");
    await expect(page.getByRole("main").getByRole("link", { name: /Call 0151 309 4681/ })).toHaveAttribute("href", "tel:+441513094681");
    await expect(page.getByRole("main").getByRole("link", { name: "WhatsApp" })).toBeVisible();
  });
});

test("unknown pages get a friendly 404", async ({ page }) => {
  const res = await page.goto("/no-such-page");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});

test.describe("accessibility and layout", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`homepage and /book pass WCAG 2.1 AA (${theme})`, async ({ page }) => {
      await setTheme(page, "site", theme);
      await page.emulateMedia({ reducedMotion: "reduce" });
      for (const path of ["/", "/book"]) {
        await page.goto(path);
        await expectAccessible(page);
      }
    });
  }

  for (const width of [320, 360, 390, 430, 768, 1024, 1280]) {
    test(`no sideways scroll at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ["/", "/book", "/login"]) {
        await page.goto(path);
        await expectNoHorizontalScroll(page);
      }
    });
  }
});

test.describe("phone only", () => {
  test.skip(({ isMobile }) => !isMobile, "phone layout");

  test("menu: opens full screen, closes on Esc and on a link, focus goes back", async ({ page }) => {
    await page.goto("/");
    const menuButton = page.getByRole("button", { name: "Menu" });
    await menuButton.click();
    const menu = page.getByRole("dialog", { name: "Menu" });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("button", { name: "Close menu" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(menuButton).toBeFocused();

    await menuButton.click();
    await menu.getByRole("link", { name: "Visit" }).click();
    await expect(menu).toBeHidden();
    await expect(page).toHaveURL(/#visit$/);
  });

  test("sticky Book bar appears only once the hero's Book button scrolls away", async ({ page }) => {
    await page.goto("/");
    const bar = page.getByTestId("sticky-book-bar");
    await expect(bar).toHaveAttribute("data-visible", "false");
    expect(await bar.evaluate((el) => (el as HTMLElement).inert)).toBe(true);
    await page.locator("#services").scrollIntoViewIfNeeded();
    await expect(bar).toHaveAttribute("data-visible", "true");
    expect(await bar.evaluate((el) => (el as HTMLElement).inert)).toBe(false);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(bar).toHaveAttribute("data-visible", "false");
  });
});

test.describe("desktop only", () => {
  test.skip(({ isMobile }) => isMobile, "desktop layout");

  test("header shows section links and Book; no phone menu or sticky bar", async ({ page }) => {
    await page.goto("/");
    const header = page.getByRole("banner");
    await expect(header.getByRole("link", { name: "Prices" })).toBeVisible();
    await expect(header.getByRole("link", { name: "Book", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Menu" })).toBeHidden();
    await expect(page.getByTestId("sticky-book-bar")).toBeHidden();
  });
});
