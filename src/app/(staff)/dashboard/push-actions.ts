"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { requireStaff } from "@/lib/auth/staff";
import { isAllowedPushEndpoint, MAX_PUSH_DEVICES, TEST_PUSH } from "@/lib/domain/push";
import { GENERIC_ERROR } from "@/lib/domain/validation";
import { PUSH_COOKIE } from "@/lib/push/cookie";
import { pushEnabled, pushTestOrigin, pushToSubscriptions } from "@/lib/push/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Booking alerts on this device (spec §8.10, §10). Subscriptions are stored against the login with the secret key
 * (the table has no policies). This device's endpoint is also kept in an http-only cookie, so signing out can
 * remove it.
 */

const b64url = (min: number, max: number) => z.string().min(min).max(max).regex(/^[A-Za-z0-9_-]+$/);
const subscriptionSchema = z.object({
  endpoint: z.string().max(1000),
  keys: z.object({ p256dh: b64url(80, 100), auth: b64url(16, 30) }),
});

export type PushAnswer = { error: string | null };

async function rememberDevice(endpoint: string | null) {
  const jar = await cookies();
  if (endpoint) {
    jar.set(PUSH_COOKIE, endpoint, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" && !pushTestOrigin(), path: "/", maxAge: 400 * 24 * 3600 });
  } else {
    jar.delete(PUSH_COOKIE);
  }
}

export async function savePushSubscription(input: unknown): Promise<PushAnswer> {
  const staff = await requireStaff();
  if (!pushEnabled()) return { error: "Booking alerts aren't set up for this shop yet." };
  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success || !isAllowedPushEndpoint(parsed.data.endpoint, pushTestOrigin())) {
    return { error: "This browser's alert service isn't supported. Try Chrome, Safari, Firefox or Edge." };
  }
  const { endpoint, keys } = parsed.data;
  const db = createAdminClient();
  const { error } = await db
    .from("push_subscriptions")
    .upsert({ endpoint, user_id: staff.userId, p256dh: keys.p256dh, auth: keys.auth, created_at: new Date().toISOString() }, { onConflict: "endpoint" });
  if (error) return { error: GENERIC_ERROR };

  // At most MAX_PUSH_DEVICES per login: the oldest go.
  const { data: mine } = await db.from("push_subscriptions").select("endpoint").eq("user_id", staff.userId).order("created_at", { ascending: false });
  const extra = (mine ?? []).slice(MAX_PUSH_DEVICES).map((s) => s.endpoint);
  if (extra.length) await db.from("push_subscriptions").delete().in("endpoint", extra);
  await rememberDevice(endpoint);
  return { error: null };
}

export async function removePushSubscription(endpoint: unknown): Promise<PushAnswer> {
  const staff = await requireStaff();
  if (typeof endpoint !== "string" || endpoint.length > 1000) return { error: GENERIC_ERROR };
  await createAdminClient().from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", staff.userId);
  await rememberDevice(null);
  return { error: null };
}

/** A test alert to this device only. */
export async function sendTestPush(endpoint: unknown): Promise<PushAnswer> {
  const staff = await requireStaff();
  if (typeof endpoint !== "string") return { error: GENERIC_ERROR };
  const { data } = await createAdminClient()
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("endpoint", endpoint)
    .eq("user_id", staff.userId)
    .maybeSingle();
  if (!data) return { error: "Alerts aren't on for this device. Turn them on first." };
  const r = await pushToSubscriptions([data], TEST_PUSH);
  if (r.gone) return { error: "This device's alerts have expired. Turn them off and on again." };
  if (!r.sent) return { error: "The test alert couldn't be sent. Please try again." };
  return { error: null };
}
