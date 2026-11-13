"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/staff";
import { clientEditSchema, DUPLICATE_PHONE_ERROR } from "@/lib/domain/clients";
import { NOT_ALLOWED_ERROR } from "@/lib/domain/staff-bookings";
import { isManager } from "@/lib/domain/team";
import { fieldErrors, GENERIC_ERROR } from "@/lib/domain/validation";
import { createSessionClient } from "@/lib/supabase/server";

export type ClientFormState = { error: string | null; fields: Record<string, string>; saved: number };

/** Edit a client's name or number (owner/admin). A number that belongs to someone else is refused. */
export async function updateClient(prev: ClientFormState, formData: FormData): Promise<ClientFormState> {
  const staff = await requireStaff();
  if (!isManager(staff)) return { ...prev, error: NOT_ALLOWED_ERROR, fields: {} };
  const parsed = clientEditSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ...prev, error: "Please check the details.", fields: fieldErrors(parsed.error) };
  const { id, name, phone } = parsed.data;

  const supabase = await createSessionClient();
  const { data, error } = await supabase.from("clients").update({ name, phone }).eq("id", id).select("id").maybeSingle();
  if (error?.code === "23505") return { ...prev, error: DUPLICATE_PHONE_ERROR, fields: { phone: DUPLICATE_PHONE_ERROR } };
  if (error || !data) return { ...prev, error: error ? GENERIC_ERROR : NOT_ALLOWED_ERROR, fields: {} };

  refresh();
  return { error: null, fields: {}, saved: prev.saved + 1 };
}

/**
 * Delete a client on their request (owner/admin). delete_client() cancels their future bookings, keeps past
 * revenue without a name, and removes their name from the activity log, in one transaction.
 */
export async function deleteClient(prev: ClientFormState, formData: FormData): Promise<ClientFormState> {
  const staff = await requireStaff();
  if (!isManager(staff)) return { ...prev, error: NOT_ALLOWED_ERROR, fields: {} };
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ...prev, error: GENERIC_ERROR, fields: {} };

  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("delete_client", { p_id: id });
  if (error) return { ...prev, error: error.code === "42501" ? NOT_ALLOWED_ERROR : GENERIC_ERROR, fields: {} };
  redirect("/dashboard/clients?deleted=1");
}
