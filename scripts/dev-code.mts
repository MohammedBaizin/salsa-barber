#!/usr/bin/env node
/**
 * LOCAL ONLY: prints the current two-step sign-in code for a sample account that has an authenticator app set up
 * on this machine's Supabase (so you can test two-step sign-in without a phone).
 *
 *   npm run dev:code -- <username>
 *
 * Refuses to run against anything but the local Supabase stack.
 */
import { execSync } from "node:child_process";
import pg from "pg";
import { secondsLeft, totp } from "../src/lib/auth/totp.ts";

const username = process.argv[2]?.trim().toLowerCase();
if (!username) {
  console.error("\nUsage: npm run dev:code -- <username>\n");
  process.exit(1);
}
process.loadEnvFile(".env.local");
const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://invalid").hostname;
if (!["127.0.0.1", "localhost", "host.docker.internal"].includes(host)) {
  console.error(`\nRefusing: .env.local points at ${host}, not the local Supabase stack.\n`);
  process.exit(1);
}
const status = execSync("npx supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
const dbUrl = status.match(/^DB_URL="?([^"\n]+)"?$/m)?.[1];
if (!dbUrl) {
  console.error("\nLocal Supabase isn't running. Start it with `npm run db:start`.\n");
  process.exit(1);
}
const client = new pg.Client({ connectionString: dbUrl });
await client.connect();
const { rows } = await client.query(
  `select f.secret from auth.mfa_factors f join public.staff s on s.user_id = f.user_id
   where s.username = $1 and f.factor_type = 'totp' and f.status = 'verified' order by f.created_at desc limit 1`,
  [username],
);
await client.end();
if (!rows[0]?.secret) {
  console.error(`\n${username} has no authenticator app set up locally (turn it on in Account first).\n`);
  process.exit(1);
}
console.log(`\n${totp(rows[0].secret)}  (changes in ${secondsLeft()}s)\n`);
