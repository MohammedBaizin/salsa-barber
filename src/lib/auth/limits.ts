import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { userHash, visitorHash } from "@/lib/visitor";

/**
 * Sign-in attempt limits (spec §9), shared by the password form, the two-step code, changing your password and
 * turning two-step sign-in off. The database counts failures by keyed hashes of the visitor and the username.
 */
export type AttemptKeys = { visitor: string; user: string };

export async function attemptKeys(username: string): Promise<AttemptKeys> {
  return { visitor: visitorHash(await headers()), user: userHash(username) };
}

/** Seconds to wait before another try (0 = go ahead). */
export async function attemptWait(keys: AttemptKeys): Promise<number> {
  const { data, error } = await createAdminClient().rpc("login_wait_seconds", { p_visitor: keys.visitor, p_user: keys.user });
  if (error) throw new Error("Couldn't check sign-in attempts.");
  return data ?? 0;
}

export async function recordFailure(keys: AttemptKeys): Promise<void> {
  await createAdminClient().rpc("record_login_failure", { p_visitor: keys.visitor, p_user: keys.user });
}

export async function clearFailures(keys: AttemptKeys): Promise<void> {
  await createAdminClient().rpc("clear_login_failures", { p_visitor: keys.visitor });
}
