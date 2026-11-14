import "server-only";
import type { PushPayload } from "@/lib/domain/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPush, type VapidKeys } from "./web-push";

/**
 * Sending booking alerts (spec §10). Off unless VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are set. Subscriptions
 * belong to logins (not staff rows) and are only ever read with the secret key. Gone subscriptions (404/410) are
 * deleted. Never throws: an alert must never affect a booking.
 */

export function vapidKeys(): VapidKeys | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: process.env.VAPID_SUBJECT || "mailto:alerts@example.invalid" };
}

export const pushEnabled = () => vapidKeys() !== null;

/** Test push service origin (end-to-end tests only). */
export const pushTestOrigin = () => process.env.PUSH_TEST_ORIGIN || null;

type Subscription = { endpoint: string; p256dh: string; auth: string };

export async function pushToSubscriptions(subscriptions: Subscription[], payload: PushPayload): Promise<{ sent: number; gone: number }> {
  const keys = vapidKeys();
  if (!keys || subscriptions.length === 0) return { sent: 0, gone: 0 };
  const text = JSON.stringify(payload);
  const results = await Promise.all(subscriptions.map((s) => sendPush(s, text, keys)));
  const gone = subscriptions.filter((_, i) => results[i] === "gone").map((s) => s.endpoint);
  if (gone.length) await createAdminClient().from("push_subscriptions").delete().in("endpoint", gone);
  return { sent: results.filter((r) => r === "sent").length, gone: gone.length };
}

/** Every device of these logins. */
export async function subscriptionsFor(userIds: string[]): Promise<Subscription[]> {
  if (!userIds.length) return [];
  const { data } = await createAdminClient().from("push_subscriptions").select("endpoint, p256dh, auth").in("user_id", userIds);
  return data ?? [];
}
