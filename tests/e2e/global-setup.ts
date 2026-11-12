import { execSync } from "node:child_process";

/** Refuses to run unless the app is configured for the LOCAL Supabase stack (tests write to the database). */
export default function globalSetup() {
  process.loadEnvFile(".env.local");
  const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://invalid").hostname;
  if (!["127.0.0.1", "localhost", "host.docker.internal"].includes(host)) {
    throw new Error(`Refusing to run e2e tests against non-local Supabase: ${host}`);
  }
  const status = execSync("npx supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const dbUrl = status.match(/^DB_URL="?([^"\n]+)"?$/m)?.[1];
  if (!dbUrl) throw new Error("Local Supabase isn't running. Start it with `npm run db:start`.");
  process.env.E2E_DB_URL = dbUrl;
}
