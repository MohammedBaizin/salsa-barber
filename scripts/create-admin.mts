#!/usr/bin/env node
/**
 * Creates the first admin account (technical/support login: never a barber, never on the website).
 *
 *   npm run create-admin -- <username> "<Display name>"          uses .env.local (local Supabase)
 *   npm run create-admin:prod -- <username> "<Display name>"     uses .env.production.local
 *
 * Prints a one-time password once. Change it after the first sign-in (Account page).
 */
import { createClient } from "@supabase/supabase-js";
import { tempPassword } from "../src/lib/auth/temp-password.ts";

const STAFF_EMAIL_DOMAIN = "staff.salsabarber.invalid"; // keep in step with src/lib/site.ts

const args = process.argv.slice(2);
const prod = args.includes("--prod");
const [rawUsername, displayName] = args.filter((a) => a !== "--prod");

function fail(message: string): never {
  console.error(`\n${message}\n`);
  process.exit(1);
}

if (!rawUsername || !displayName) {
  fail('Usage: npm run create-admin -- <username> "<Display name>"');
}
const username = rawUsername.trim().toLowerCase();
if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
  fail("Username must be 3–30 characters: lowercase letters, numbers, dots, dashes or underscores.");
}
const name = displayName.replace(/\s+/g, " ").trim();
if (!name || name.length > 60) fail("Display name must be 1–60 characters.");

const envFile = prod ? ".env.production.local" : ".env.local";
try {
  process.loadEnvFile(envFile);
} catch {
  fail(`Couldn't read ${envFile}. ${prod ? "Create it with the production Supabase URL and secret key." : "Run npm run env:local first."}`);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) fail(`${envFile} needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.`);
console.log(`Target: ${new URL(url).host}${prod ? " (PRODUCTION)" : ""}`);

const supabase = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: existing } = await supabase.from("staff").select("id").eq("username", username).maybeSingle();
if (existing) fail(`The username "${username}" is already taken.`);

const password = tempPassword();
const { data: created, error: authError } = await supabase.auth.admin.createUser({
  email: `${username}@${STAFF_EMAIL_DOMAIN}`,
  password,
  email_confirm: true,
});
if (authError || !created.user) fail(`Couldn't create the login: ${authError?.message ?? "unknown error"}`);

const { error: profileError } = await supabase.from("staff").insert({
  user_id: created.user.id,
  username,
  display_name: name,
  role: "admin",
  bookable: false,
  show_on_site: false,
  active: true,
});
if (profileError) {
  await supabase.auth.admin.deleteUser(created.user.id);
  fail(`Couldn't create the profile (login removed again): ${profileError.message}`);
}

console.log(`
Admin account created.

  Username:            ${username}
  One-time password:   ${password}

This password is shown once. Sign in at /login and change it on the Account page.
`);
