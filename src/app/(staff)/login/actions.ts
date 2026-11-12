"use server";

import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/auth/redirect";
import { SIGN_IN_ERRORS } from "@/lib/auth/sign-in-messages";
import { loginEmail, usernameSchema } from "@/lib/domain/team";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSessionClient } from "@/lib/supabase/server";

export type SignInState = { error: string | null; username: string };


/**
 * Username + password sign-in. The username becomes <username>@<staff domain> for Supabase Auth.
 * Unknown usernames and wrong passwords get the same answer (no user enumeration).
 * Per-visitor/username attempt limits are added in the sign-in security phase.
 */
export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const rawUsername = String(formData.get("username") ?? "").slice(0, 100);
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(formData.get("next"));

  if (!rawUsername.trim() || !password) return { error: SIGN_IN_ERRORS.missing, username: rawUsername };
  const username = usernameSchema.safeParse(rawUsername);
  if (!username.success || password.length > 200) return { error: SIGN_IN_ERRORS.wrong, username: rawUsername };

  const supabase = await createSessionClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail(username.data), password });
  if (error || !data.user) {
    return { error: error?.status === 429 ? SIGN_IN_ERRORS.busy : SIGN_IN_ERRORS.wrong, username: rawUsername };
  }

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
