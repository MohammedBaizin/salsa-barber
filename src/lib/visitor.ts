import "server-only";
import { createHmac } from "node:crypto";

/**
 * A keyed hash of the visitor's IP address for rate limits (never the raw address; spec §5.2, §9).
 * Keyed with the server secret so the stored hashes can't be reversed by guessing addresses.
 */
export function visitorHash(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || headers.get("x-real-ip")?.trim() || "unknown";
  const key = process.env.SUPABASE_SECRET_KEY ?? "local-dev-only";
  return createHmac("sha256", key).update(`visitor:${ip}`).digest("hex").slice(0, 32);
}

/** A keyed hash of a username for sign-in limits (case-insensitive; unknown usernames hash the same way). */
export function userHash(username: string): string {
  const key = process.env.SUPABASE_SECRET_KEY ?? "local-dev-only";
  return createHmac("sha256", key).update(`user:${username.trim().toLowerCase()}`).digest("hex").slice(0, 32);
}
