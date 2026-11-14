import { defineConfig, devices } from "@playwright/test";

/**
 * Read-only smoke tests of a deployed site (spec §15):
 *
 *   SMOKE_URL=https://your-site.vercel.app npm run test:smoke
 *
 * Optional, for the database checks (both are public values, also in Vercel's env settings):
 *   SMOKE_SUPABASE_URL=https://<project>.supabase.co SMOKE_SUPABASE_KEY=<publishable key>
 *
 * Nothing is written. (The sign-up check asks Supabase to create an account and expects to be refused.)
 */
const url = process.env.SMOKE_URL;
if (!url) throw new Error("Set SMOKE_URL to the site to check, e.g. SMOKE_URL=https://salsa-barber.vercel.app npm run test:smoke");

export default defineConfig({
  testDir: "tests/smoke",
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: "list",
  timeout: 30_000,
  use: { baseURL: url.replace(/\/$/, ""), trace: "retain-on-failure" },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
});
