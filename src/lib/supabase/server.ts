import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import type { Database } from "./database.types";
import { supabasePublishableKey, supabaseUrl } from "./env";

/**
 * Session client for server components, server actions and route handlers (RLS: the signed-in staff member).
 * Create a new one per request. Keep callers inside <Suspense>.
 * `connection()` keeps session work at request time (never in a prerender or prefetch): the auth client reads the
 * clock to check token expiry, and a staff check must always be fresh.
 */
export async function createSessionClient() {
  await connection();
  const cookieStore = await cookies();
  return createServerClient<Database>(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies are read-only. proxy.ts refreshes the session instead.
        }
      },
    },
  });
}
