import { NextResponse, type NextRequest } from "next/server";
import { PUSH_COOKIE } from "@/lib/push/cookie";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSessionClient } from "@/lib/supabase/server";

/**
 * Signs out THIS device only (other devices stay signed in), then goes to /login.
 * POST from the sign-out button; GET is used by requireStaff() when an account has been switched off.
 * Also stops booking alerts on this device: its push subscription (endpoint remembered in a cookie) is removed.
 */
async function signOut(request: NextRequest) {
  const supabase = await createSessionClient();
  const endpoint = request.cookies.get(PUSH_COOKIE)?.value;
  if (endpoint) {
    const { data } = await supabase.auth.getUser();
    if (data.user) await createAdminClient().from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", data.user.id);
  }
  await supabase.auth.signOut({ scope: "local" });

  const reason = request.nextUrl.searchParams.get("reason");
  const url = new URL("/login", request.url);
  url.searchParams.set("message", reason === "switched_off" ? "switched_off" : "signed_out");
  const response = NextResponse.redirect(url, 303);
  if (endpoint) response.cookies.delete(PUSH_COOKIE);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const GET = signOut;
export const POST = signOut;
