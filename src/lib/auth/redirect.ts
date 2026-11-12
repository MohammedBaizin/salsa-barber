/**
 * Where to go after signing in. Only dashboard paths are allowed (no open redirects):
 * "/dashboard", "/dashboard/…", optionally with a query string. Anything else -> "/dashboard".
 */
export function safeNextPath(value: unknown): string {
  if (typeof value !== "string") return "/dashboard";
  const v = value.trim();
  if (v.length > 500) return "/dashboard";
  // Same-origin absolute path only: no scheme, no protocol-relative "//", no backslashes, no control characters.
  if (!/^\/dashboard(\/[A-Za-z0-9\-._~/%]*)?(\?[A-Za-z0-9\-._~%=&+,]*)?$/.test(v)) return "/dashboard";
  if (v.includes("//") || /%2f|%5c|%2e%2e/i.test(v) || v.includes("..")) return "/dashboard";
  return v;
}
