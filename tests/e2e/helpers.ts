import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import pg from "pg";

export const SAMPLE_PASSWORD = "LocalDev-Sample-1";

/** Direct SQL against the local database (setup/cleanup only). */
export async function sql(text: string, values?: unknown[]) {
  const client = new pg.Client({ connectionString: process.env.E2E_DB_URL });
  await client.connect();
  try {
    return (await client.query(text, values)).rows;
  } finally {
    await client.end();
  }
}

/**
 * The form's alert. Next's route announcer is also role="alert", so match on our own text container.
 */
export function formAlert(page: Page) {
  return page.locator("form [role=alert]");
}

export async function signIn(page: Page, username: string, password = SAMPLE_PASSWORD) {
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

export async function setTheme(page: Page, area: "site" | "dashboard", theme: "light" | "dark") {
  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key, value),
    [area === "site" ? "salsa-site-theme" : "salsa-dashboard-theme", theme] as const,
  );
}

/** WCAG 2.1 AA check with axe. */
export async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}
