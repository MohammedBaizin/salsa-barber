"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { bookingErrorMessage, GENERIC_ERROR } from "@/lib/domain/validation";
import { alertOwner } from "@/lib/email/owner-alert";
import { createAdminClient } from "@/lib/supabase/admin";

export type CancelState = { error: string | null; done: boolean; attempt: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The customer cancels from their private page (spec §4.4). The database refuses after the cut-off or once the
 * booking isn't pending/confirmed ('not_changeable'). The owner is emailed afterwards (if set up).
 */
export async function cancelBooking(prev: CancelState, formData: FormData): Promise<CancelState> {
  const attempt = prev.attempt + 1;
  const token = formData.get("token");
  if (typeof token !== "string" || !UUID.test(token)) return { error: GENERIC_ERROR, done: false, attempt };
  const { data, error } = await createAdminClient().rpc("cancel_managed_booking", { p_token: token });
  if (error || !data?.length) {
    // Show the page's current state too (it may already be cancelled or past the cut-off).
    refresh();
    return { error: bookingErrorMessage(error?.message), done: false, attempt };
  }
  after(() => alertOwner("cancel", token));
  refresh();
  return { error: null, done: true, attempt };
}
