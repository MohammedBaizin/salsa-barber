"use server";

import { refresh } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { attemptKeys, attemptWait, clearFailures, recordFailure } from "@/lib/auth/limits";
import { CODE_ERRORS, tooManyAttempts } from "@/lib/auth/sign-in-messages";
import { requireStaff } from "@/lib/auth/staff";
import { nextSaveState as state, type SaveState } from "@/lib/dashboard/action-state";
import { checkPassword, PASSWORD_MAX } from "@/lib/domain/password";
import { loginEmail } from "@/lib/domain/team";
import { GENERIC_ERROR } from "@/lib/domain/validation";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/env";
import { createSessionClient } from "@/lib/supabase/server";

/**
 * Your own account (spec §8.10): change password (current password checked, attempts limited) and two-step
 * sign-in on/off (turning it off needs a current code). Wrong passwords and codes share the sign-in limits.
 */

const fail = (prev: SaveState, error: string, fields: Record<string, string> = {}) => state(prev, { error, fields });

/** Checks a password without touching this browser's session (a throwaway sign-in that's ended straight away). */
async function passwordIsRight(username: string, password: string): Promise<boolean> {
  const probe = createClient(supabaseUrl(), supabasePublishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await probe.auth.signInWithPassword({ email: loginEmail(username), password });
  if (error || !data.session) return false;
  await probe.auth.signOut({ scope: "local" });
  return true;
}

export async function changePassword(prev: SaveState, formData: FormData): Promise<SaveState> {
  const staff = await requireStaff();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const keys = await attemptKeys(staff.username);
  const wait = await attemptWait(keys);
  if (wait > 0) return fail(prev, tooManyAttempts(wait));

  const fields: Record<string, string> = {};
  if (!current) fields.current = "Enter your current password.";
  const rules = checkPassword(next, { username: staff.username, name: staff.displayName });
  if (!rules.ok) fields.password = "The new password doesn't meet every rule below.";
  else if (next !== confirm) fields.confirm = "The two new passwords don't match.";
  else if (next === current) fields.password = "Choose a password you haven't used here.";
  if (Object.keys(fields).length) return fail(prev, "Please check the passwords.", fields);
  if (current.length > PASSWORD_MAX + 128) return fail(prev, "Please check the passwords.", { current: "That isn't your current password." });

  if (!(await passwordIsRight(staff.username, current))) {
    await recordFailure(keys);
    return fail(prev, "Please check the passwords.", { current: "That isn't your current password." });
  }
  const supabase = await createSessionClient();
  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) return fail(prev, error.code === "weak_password" ? "That password isn't accepted. Please choose another." : GENERIC_ERROR);
  await clearFailures(keys);
  await supabase.rpc("log_account_event", { p_action: "account.password_change", p_staff: staff.id });
  return state(prev, { done: { notice: "Password changed." } });
}

// ---------------------------------------------------------------------------
// Two-step sign-in (authenticator app, TOTP)
// ---------------------------------------------------------------------------

export type EnrolState = { error: string | null; factorId: string | null; qr: string | null; secret: string | null; attempt: number };

/** Step 1: a new authenticator key (QR code + text key). Unfinished earlier attempts are removed first. */
export async function startTwoStep(prev: EnrolState): Promise<EnrolState> {
  await requireStaff();
  const supabase = await createSessionClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  if (factors?.totp.some((f) => f.status === "verified")) return { ...prev, error: "Two-step sign-in is already on.", attempt: prev.attempt + 1 };
  for (const f of factors?.all ?? []) {
    if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Authenticator app" });
  if (error || !data) return { error: GENERIC_ERROR, factorId: null, qr: null, secret: null, attempt: prev.attempt + 1 };
  return { error: null, factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret, attempt: prev.attempt + 1 };
}

/** Step 2: confirm with a code from the app; this session becomes two-step verified. */
export async function confirmTwoStep(prev: SaveState, formData: FormData): Promise<SaveState> {
  const staff = await requireStaff();
  const factorId = String(formData.get("factorId") ?? "");
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  const keys = await attemptKeys(staff.username);
  const wait = await attemptWait(keys);
  if (wait > 0) return fail(prev, tooManyAttempts(wait));
  if (!/^\d{6}$/.test(code)) return fail(prev, CODE_ERRORS.format, { code: CODE_ERRORS.format });

  const supabase = await createSessionClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) {
    await recordFailure(keys);
    return fail(prev, CODE_ERRORS.wrong, { code: CODE_ERRORS.wrong });
  }
  await clearFailures(keys);
  await supabase.rpc("log_account_event", { p_action: "account.2fa_on", p_staff: staff.id });
  refresh();
  return state(prev, { done: { notice: "Two-step sign-in is on." } });
}

/** Turning it off needs a current code (so someone with a borrowed, unlocked session can't). */
export async function turnOffTwoStep(prev: SaveState, formData: FormData): Promise<SaveState> {
  const staff = await requireStaff();
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  const keys = await attemptKeys(staff.username);
  const wait = await attemptWait(keys);
  if (wait > 0) return fail(prev, tooManyAttempts(wait));
  if (!/^\d{6}$/.test(code)) return fail(prev, CODE_ERRORS.format, { code: CODE_ERRORS.format });

  const supabase = await createSessionClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp.find((f) => f.status === "verified");
  if (!factor) return state(prev, { done: { notice: "Two-step sign-in is already off." } });
  const verified = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (verified.error) {
    await recordFailure(keys);
    return fail(prev, CODE_ERRORS.wrong, { code: CODE_ERRORS.wrong });
  }
  await clearFailures(keys);
  const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
  if (error) return fail(prev, GENERIC_ERROR);
  await supabase.rpc("log_account_event", { p_action: "account.2fa_off", p_staff: staff.id });
  refresh();
  return state(prev, { done: { notice: "Two-step sign-in is off." } });
}
