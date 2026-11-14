import { expect, test } from "@playwright/test";

/** Launch details (spec §4.1, §10): robots, sitemap, no-index pages, the daily health check. */
test.describe("launch", () => {
  test("robots keeps private areas out of search; the sitemap lists the public pages", async ({ request }) => {
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toMatch(/User-Agent: \*/i);
    for (const path of ["/dashboard", "/login", "/api", "/booking"]) expect(robots).toContain(`Disallow: ${path}`);
    expect(robots).toMatch(/Sitemap: https?:\/\/[^\s]+\/sitemap\.xml/);
    const sitemap = await (await request.get("/sitemap.xml")).text();
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
    expect(locs).toEqual(["/", "/book"]);
  });

  test("staff pages and private booking pages are never indexed", async ({ page }) => {
    for (const path of ["/login", "/booking/00000000-0000-4000-8000-000000000000"]) {
      await page.goto(path);
      await expect(page.locator('meta[name="robots"][content*="noindex"]').first(), path).toBeAttached();
    }
  });

  test("the daily health check is scheduled", async ({ request }) => {
    const { readFileSync } = await import("node:fs");
    const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
    expect(vercel.crons).toEqual([{ path: "/api/health", schedule: expect.stringMatching(/^\d+ \d+ \* \* \*$/) }]);
    expect((await request.get("/api/health")).status()).toBe(200);
  });
});
