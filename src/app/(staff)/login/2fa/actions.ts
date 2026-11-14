"use server";

import { redirect } from "next/navigation";
import { attemptKeys, attemptWait, clearFailures, recordFailure } from "@/lib/auth/limits";
import { safeNextPath } from "@/lib/auth/redirect";
import { CODE_ERRORS, tooManyAttempts } from "@/lib/auth/sign-in-messages";
import { createSessionClient } from "@/lib/supabase/server";

export type CodeState = { error: string | null; attempt: number };

/**
 * Second step of sign-in: the 6-digit code from the authenticator app upgrades this session to aal2.
 * Wrong codes count towards the same attempt limits as wrong passwords.
 */
export async function verifySignInCode(prev: CodeState, formData: FormData): Promise<CodeState> {
  const attempt = prev.attempt + 1;
  const next = safeNextPath(formData.get("next"));
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  const supabase = await createSessionClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) redirect("/login");

  const keys = await attemptKeys(user.user.email?.split("@")[0] ?? user.user.id);
  const wait = await attemptWait(keys);
  if (wait > 0) return { error: tooManyAttempts(wait), attempt };
  if (!/^\d{6}$/.test(code)) return { error: CODE_ERRORS.format, attempt };

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp.find((f) => f.status === "verified");
  if (!factor) redirect(next);

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (error) {
    await recordFailure(keys);
    return { error: CODE_ERRORS.wrong, attempt };
  }
  await clearFailures(keys);
  redirect(next);
}
