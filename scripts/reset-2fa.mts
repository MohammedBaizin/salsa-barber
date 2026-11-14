#!/usr/bin/env node
/**
 * Recovery: removes a person's authenticator app (two-step sign-in) and signs them out everywhere, e.g. when the
 * only admin has lost their phone. Afterwards they sign in with just their password and can set it up again.
 *
 *   npm run reset-2fa -- <username>              local (.env.local)
 *   npm run reset-2fa -- <username> --prod       production (.env.production.local)
 *
 * Done with the secret key, so it isn't in the dashboard's activity log: keep a note of when and why.
 */
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const prod = args.includes("--prod");
const username = args.find((a) => a !== "--prod")?.trim().toLowerCase();
function fail(message: string): never {
  console.error(`\n${message}\n`);
  process.exit(1);
}
if (!username) fail("Usage: npm run reset-2fa -- <username> [--prod]");

const envFile = prod ? ".env.production.local" : ".env.local";
try {
  process.loadEnvFile(envFile);
} catch {
  fail(`Couldn't read ${envFile}.`);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) fail(`${envFile} needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.`);
console.log(`Target: ${new URL(url).host}${prod ? " (PRODUCTION)" : ""}`);

const supabase = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: staff, error } = await supabase.from("staff").select("user_id, display_name").eq("username", username).is("deleted_at", null).maybeSingle();
if (error) fail(`Couldn't read the team: ${error.message}`);
if (!staff?.user_id) fail(`No account with the username ${username}.`);

const { data: factors, error: listError } = await supabase.auth.admin.mfa.listFactors({ userId: staff.user_id });
if (listError) fail(`Couldn't read their sign-in settings: ${listError.message}`);
for (const f of factors.factors) {
  const r = await supabase.auth.admin.mfa.deleteFactor({ id: f.id, userId: staff.user_id });
  if (r.error) fail(`Couldn't remove the authenticator app: ${r.error.message}`);
}
await supabase.rpc("end_user_sessions", { p_user: staff.user_id });
console.log(
  factors.factors.length
    ? `\nTwo-step sign-in reset for ${staff.display_name} (${username}). They've been signed out everywhere.\n`
    : `\n${staff.display_name} (${username}) didn't have two-step sign-in. Nothing changed.\n`,
);
