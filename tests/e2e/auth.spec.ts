import { expect, test } from "@playwright/test";
import { expectAccessible, expectNoHorizontalScroll, formAlert, setTheme, signIn, sql } from "./helpers";

test.describe("staff sign-in", () => {
  test("signed-out visitors are sent from the dashboard to /login with a return path", async ({ page }) => {
    await page.goto("/dashboard?view=week");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%3Fview%3Dweek$/);
    await expect(page.getByRole("heading", { name: "Staff sign in" })).toBeVisible();
  });

  test("wrong password: friendly error, username kept, same message as an unknown username", async ({ page }) => {
    await page.goto("/login");
    await signIn(page, "sam", "not-the-password");
    await expect(formAlert(page)).toHaveText("Wrong username or password.");
    await expect(page.getByLabel("Username")).toHaveValue("sam");
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");

    await signIn(page, "nobody-here", "whatever-password");
    await expect(formAlert(page)).toHaveText("Wrong username or password.");
  });

  test("empty form asks for both fields", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(formAlert(page)).toHaveText("Enter your username and password.");
  });

  test("show/hide password", async ({ page }) => {
    await page.goto("/login");
    const password = page.getByLabel("Password", { exact: true });
    await password.fill("secret");
    await expect(password).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Show password" }).click();
    await expect(password).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Hide password" }).click();
    await expect(password).toHaveAttribute("type", "password");
  });

  test("signs in (username is case-insensitive), returns to the requested page, signs out", async ({ page }) => {
    await page.goto("/dashboard?view=week");
    await signIn(page, "  SAM ");
    await expect(page).toHaveURL(/\/dashboard\?view=week$/);
    await expect(page.getByTestId("signed-in-as")).toHaveText("Signed in as sam · Barber");

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login\?message=signed_out$/);
    await expect(page.getByRole("status")).toHaveText("You've signed out.");

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
  });

  test("never redirects off-site after sign-in", async ({ page }) => {
    await page.goto("/login?next=https%3A%2F%2Fevil.example%2F");
    await signIn(page, "owner");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByTestId("signed-in-as")).toHaveText("Signed in as owner · Owner");
  });

  test("a switched-off account can't sign in", async ({ page }) => {
    await page.goto("/login");
    await signIn(page, "off");
    await expect(formAlert(page)).toHaveText(/This account has been switched off/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("switching someone off signs them out on their next page load", async ({ page }) => {
    await page.goto("/login");
    await signIn(page, "jamie");
    await expect(page.getByTestId("signed-in-as")).toBeVisible();
    await sql("update public.staff set active = false where username = 'jamie'");
    try {
      await page.reload();
      await expect(page).toHaveURL(/\/login\?message=switched_off$/);
      await expect(page.getByRole("status")).toHaveText(/This account has been switched off/);
      await page.goto("/dashboard");
      await expect(page).toHaveURL(/\/login\?next=/);
    } finally {
      await sql("update public.staff set active = true where username = 'jamie'");
    }
  });
});

test.describe("login page quality", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`WCAG 2.1 AA and no sideways scroll (${theme})`, async ({ page }) => {
      await setTheme(page, "dashboard", theme);
      await page.emulateMedia({ colorScheme: theme });
      await page.goto("/login");
      await expect(page.locator("html")).toHaveClass(theme === "dark" ? /dark/ : /^(?!.*dark)/);
      await expectNoHorizontalScroll(page);
      await expectAccessible(page);
      await signIn(page, "sam", "wrong-password-here");
      await expect(formAlert(page)).toBeVisible();
      await expectAccessible(page);
    });
  }

  test("is not indexed", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });
});

test("health check reports the database is reachable", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
});
