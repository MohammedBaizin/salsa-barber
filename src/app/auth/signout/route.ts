import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";

/**
 * Signs out THIS device only (other devices stay signed in), then goes to /login.
 * POST from the sign-out button; GET is used by requireStaff() when an account has been switched off.
 * Phase 16 also removes this device's push subscription here.
 */
async function signOut(request: NextRequest) {
  const supabase = await createSessionClient();
  await supabase.auth.signOut({ scope: "local" });

  const reason = request.nextUrl.searchParams.get("reason");
  const url = new URL("/login", request.url);
  url.searchParams.set("message", reason === "switched_off" ? "switched_off" : "signed_out");
  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const GET = signOut;
export const POST = signOut;
