import { unstable_rethrow } from "next/navigation";
import { GENERIC_ERROR, OFFLINE_ERROR } from "@/lib/domain/validation";

/**
 * Wraps a server action used with useActionState so a lost connection (or any thrown error) becomes a
 * normal error message in the form instead of a crash. Next.js redirects and notFound() still work.
 */
export function safely<S extends { error?: string | null }, A extends unknown[]>(
  action: (state: S, ...args: A) => Promise<S>,
): (state: S, ...args: A) => Promise<S> {
  return async (state, ...args) => {
    try {
      return await action(state, ...args);
    } catch (error) {
      unstable_rethrow(error);
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      return { ...state, error: offline ? OFFLINE_ERROR : GENERIC_ERROR };
    }
  };
}
