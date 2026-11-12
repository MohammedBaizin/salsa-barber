#!/usr/bin/env node
/**
 * npm run test:e2e [-- <playwright args>]
 * Imports website photos if the local gallery is empty, builds with online booking ON (the e2e suite tests the
 * booking flow; real environment variables override .env.local), then runs Playwright against that build.
 */
import { spawnSync } from "node:child_process";

const env = { ...process.env, NEXT_PUBLIC_BOOKING_ENABLED: "true", NEXT_PUBLIC_SHOW_PLACEHOLDERS: "false" };
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: "inherit", env, shell: process.platform === "win32" });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

run("node", ["scripts/photos-import.mts", "--if-empty"]);
run("npx", ["next", "build"]);
run("npx", ["playwright", "test", ...process.argv.slice(2)]);
