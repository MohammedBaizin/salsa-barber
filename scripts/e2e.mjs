#!/usr/bin/env node
/**
 * npm run test:e2e [-- <playwright args>]
 * Imports website photos if the local gallery is empty, builds (online booking is the Settings switch in the local
 * database, on by default), then runs Playwright against that build
 * (playwright.config.ts sets up booking alerts with throwaway keys and a local stand-in push service).
 *
 * `next build` / `next start` also load `.env.production.local`, which may point at the PRODUCTION Supabase.
 * Real environment variables win over every .env file, so the Supabase settings from `.env.local` (the local stack)
 * are passed explicitly: the test build can never read or write the live database.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

const local = parseEnv(readFileSync(".env.local", "utf8"));
const supabase = Object.fromEntries(Object.entries(local).filter(([k]) => /SUPABASE/.test(k)));
const host = new URL(supabase.NEXT_PUBLIC_SUPABASE_URL ?? "http://invalid").hostname;
if (!["127.0.0.1", "localhost", "host.docker.internal"].includes(host)) {
  console.error(`Refusing to run e2e tests: .env.local points at ${host}, not the local Supabase stack.`);
  process.exit(1);
}

const env = { ...process.env, ...supabase, NEXT_PUBLIC_SHOW_PLACEHOLDERS: "false" };
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: "inherit", env, shell: process.platform === "win32" });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

run("node", ["scripts/photos-import.mts", "--if-empty"]);
run("npx", ["next", "build"]);
run("npx", ["playwright", "test", ...process.argv.slice(2)]);
