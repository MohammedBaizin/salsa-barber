#!/usr/bin/env node
/**
 * npm run env:local
 * Writes the local Supabase URL and keys into .env.local (creating it from .env.example if needed).
 * Only touches the three Supabase lines; everything else in .env.local is kept.
 */
import { execSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";

const status = execSync("npx supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
const get = (key) => status.match(new RegExp(`^${key}="?([^"\n]+)"?$`, "m"))?.[1];
const values = {
  NEXT_PUBLIC_SUPABASE_URL: get("API_URL"),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: get("PUBLISHABLE_KEY"),
  SUPABASE_SECRET_KEY: get("SECRET_KEY"),
};
if (Object.values(values).some((v) => !v)) {
  console.error("Supabase isn't running. Start it with: npm run db:start");
  process.exit(1);
}
if (!existsSync(".env.local")) copyFileSync(".env.example", ".env.local");
let env = readFileSync(".env.local", "utf8");
for (const [key, value] of Object.entries(values)) {
  const line = `${key}=${value}`;
  env = new RegExp(`^${key}=.*$`, "m").test(env) ? env.replace(new RegExp(`^${key}=.*$`, "m"), line) : `${env.trimEnd()}\n${line}\n`;
}
writeFileSync(".env.local", env);
console.log("Updated .env.local with the local Supabase URL and keys.");
