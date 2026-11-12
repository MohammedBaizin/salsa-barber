import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Fast first gate for the staff area. NOT the security boundary: every page, server action and route handler
 * calls requireStaff(), and the database enforces RLS.
 *
 * - Refreshes the Supabase session cookie (server components can't write cookies).
 * - Sends signed-out visitors from /dashboard to /login?next=…
 * - Lets server action POSTs through so requireStaff() can answer them in the action's own response.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
          // Responses that set auth cookies must never be cached by a CDN.
          for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
        },
      },
    },
  );

  // Verifies the JWT and refreshes it when needed (no database query).
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  const { pathname, search } = request.nextUrl;
  const isServerAction = request.method === "POST" && request.headers.has("next-action");

  if (!signedIn && pathname.startsWith("/dashboard") && !isServerAction) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", `${pathname}${search}`);
    const redirect = NextResponse.redirect(url, 307);
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }

  return response;
}

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*", "/login", "/login/:path*"],
};
