import { defineConfig, devices } from "@playwright/test";
import { generateVapidKeys } from "./src/lib/push/web-push";

/**
 * End-to-end tests against a PRODUCTION build on port 3418 and the LOCAL Supabase stack.
 * `npm run test:e2e` builds first. Phone (Pixel 7) runs first, then desktop.
 */
const PORT = 3418;

// Booking alerts for this run: throwaway keys (made once; the test workers inherit them) and the local stand-in push
// service that tests/e2e/push.spec.ts runs on port 3419.
if (!process.env.E2E_VAPID_PUBLIC_KEY) {
  const keys = generateVapidKeys();
  process.env.E2E_VAPID_PUBLIC_KEY = keys.publicKey;
  process.env.E2E_VAPID_PRIVATE_KEY = keys.privateKey;
}
export const PUSH_TEST_ORIGIN = "http://127.0.0.1:3419";

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: `npx next start --port ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    env: {
      VAPID_PUBLIC_KEY: process.env.E2E_VAPID_PUBLIC_KEY!,
      VAPID_PRIVATE_KEY: process.env.E2E_VAPID_PRIVATE_KEY!,
      VAPID_SUBJECT: "mailto:alerts@example.invalid",
      PUSH_TEST_ORIGIN,
    },
    timeout: 60_000,
  },
});
