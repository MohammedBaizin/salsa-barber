"use server";

import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/auth/redirect";
import { attemptKeys, attemptWait, clearFailures, recordFailure } from "@/lib/auth/limits";
import { SIGN_IN_ERRORS, tooManyAttempts } from "@/lib/auth/sign-in-messages";
import { loginEmail, usernameSchema } from "@/lib/domain/team";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSessionClient } from "@/lib/supabase/server";

export type SignInState = { error: string | null; username: string };


/**
 * Username + password sign-in. The username becomes <username>@<staff domain> for Supabase Auth.
 * Unknown usernames and wrong passwords get the same answer (no user enumeration). Attempt limits are checked
 * before the password (per visitor + username, per visitor, per username); unknown usernames count the same way.
 * A success clears this visitor's failures.
 */
export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const rawUsername = String(formData.get("username") ?? "").slice(0, 100);
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(formData.get("next"));

  if (!rawUsername.trim() || !password) return { error: SIGN_IN_ERRORS.missing, username: rawUsername };

  const keys = await attemptKeys(rawUsername);
  const wait = await attemptWait(keys);
  if (wait > 0) return { error: tooManyAttempts(wait), username: rawUsername };

  const username = usernameSchema.safeParse(rawUsername);
  if (!username.success || password.length > 200) {
    await recordFailure(keys);
    return { error: SIGN_IN_ERRORS.wrong, username: rawUsername };
  }

  const supabase = await createSessionClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail(username.data), password });
  if (error || !data.user) {
    if (error?.status === 429) return { error: SIGN_IN_ERRORS.busy, username: rawUsername };
    await recordFailure(keys);
    return { error: SIGN_IN_ERRORS.wrong, username: rawUsername };
  }
  await clearFailures(keys);

  const { data: staff } = await createAdminClient()
    .from("staff")
    .select("active, deleted_at")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (!staff || !staff.active || staff.deleted_at) {
    await supabase.auth.signOut({ scope: "local" });
    return { error: SIGN_IN_ERRORS.switchedOff, username: rawUsername };
  }

  // Two-step sign-in: accounts with a verified authenticator app finish on /login/2fa.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
    redirect(`/login/2fa?next=${encodeURIComponent(next)}`);
  }

  redirect(next);
}
