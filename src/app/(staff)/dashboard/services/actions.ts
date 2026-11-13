"use server";

import { refresh, updateTag } from "next/cache";
import { requireStaff } from "@/lib/auth/staff";
import { parseServiceDays, SERVICE_HAS_BOOKINGS, serviceInputSchema } from "@/lib/domain/services";
import { NOT_ALLOWED_ERROR } from "@/lib/domain/staff-bookings";
import { fieldErrors, GENERIC_ERROR } from "@/lib/domain/validation";
import { createSessionClient } from "@/lib/supabase/server";

/**
 * Services and prices (spec §8.6), owner/admin only (RLS too). Every change refreshes the website's cache: the
 * price list and online booking read services. Existing bookings keep their own snapshot of name, price and length.
 */

export type ServiceFormState = { error: string | null; fields: Record<string, string>; done: string | null; attempt: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const answer = (prev: ServiceFormState, next: Partial<ServiceFormState>): ServiceFormState => ({
  error: null,
  fields: {},
  done: null,
  ...next,
  attempt: prev.attempt + 1,
});
const saved = (prev: ServiceFormState, notice: string) => {
  updateTag("site-content");
  refresh();
  return answer(prev, { done: notice });
};

export async function saveService(prev: ServiceFormState, formData: FormData): Promise<ServiceFormState> {
  await requireStaff(["owner", "admin"]);
  const id = formData.get("id");
  const parsed = serviceInputSchema.safeParse({
    name: formData.get("name") ?? "",
    price: formData.get("price") ?? "",
    durationMin: formData.get("durationMin"),
  });
  const days = parseServiceDays(formData.getAll("days").map(String));
  if (!parsed.success || !days.ok) {
    const fields = parsed.success ? {} : fieldErrors(parsed.error);
    if (!days.ok) fields.days = days.error;
    return answer(prev, { error: "Please check the details.", fields });
  }
  const values = { name: parsed.data.name, price_pence: parsed.data.price, duration_min: parsed.data.durationMin, bookable_days: days.days };
  const supabase = await createSessionClient();

  if (typeof id === "string" && UUID.test(id)) {
    const { data, error } = await supabase.from("services").update(values).eq("id", id).select("id").maybeSingle();
    if (error || !data) return answer(prev, { error: error ? GENERIC_ERROR : NOT_ALLOWED_ERROR });
    return saved(prev, `${values.name} saved.`);
  }

  const { data: last } = await supabase.from("services").select("sort").order("sort", { ascending: false }).limit(1).maybeSingle();
  const { data: created, error } = await supabase
    .from("services")
    .insert({ ...values, active: true, sort: (last?.sort ?? 0) + 10 })
    .select("id")
    .single();
  if (error || !created) return answer(prev, { error: error?.code === "42501" ? NOT_ALLOWED_ERROR : GENERIC_ERROR });

  // Every bookable barber offers a new service by default (changeable per person in Team).
  const { data: barbers } = await supabase.from("staff").select("id").eq("bookable", true).eq("active", true).is("deleted_at", null).neq("role", "admin");
  if (barbers?.length) {
    await supabase.from("staff_services").insert(barbers.map((b) => ({ staff_id: b.id, service_id: created.id })));
  }
  return saved(prev, `${values.name} added.`);
}

export async function setServiceActive(prev: ServiceFormState, formData: FormData): Promise<ServiceFormState> {
  await requireStaff(["owner", "admin"]);
  const id = formData.get("id");
  if (typeof id !== "string" || !UUID.test(id)) return answer(prev, { error: GENERIC_ERROR });
  const active = formData.get("active") === "1";
  const supabase = await createSessionClient();
  const { data, error } = await supabase.from("services").update({ active }).eq("id", id).select("name").maybeSingle();
  if (error || !data) return answer(prev, { error: error ? GENERIC_ERROR : NOT_ALLOWED_ERROR });
  return saved(prev, active ? `${data.name} switched on.` : `${data.name} switched off.`);
}

/** Only services that were never booked (the database refuses the rest: bookings keep their service). */
export async function deleteService(prev: ServiceFormState, formData: FormData): Promise<ServiceFormState> {
  await requireStaff(["owner", "admin"]);
  const id = formData.get("id");
  if (typeof id !== "string" || !UUID.test(id)) return answer(prev, { error: GENERIC_ERROR });
  const supabase = await createSessionClient();
  const { data, error } = await supabase.from("services").delete().eq("id", id).select("name");
  if (error?.code === "23503") return answer(prev, { error: SERVICE_HAS_BOOKINGS });
  if (error || !data?.length) return answer(prev, { error: error ? GENERIC_ERROR : NOT_ALLOWED_ERROR });
  return saved(prev, `${data[0].name} deleted.`);
}

/** New order (ids top to bottom). Only rows whose position changed are written. */
export async function reorderServices(ids: string[]): Promise<{ error: string | null }> {
  await requireStaff(["owner", "admin"]);
  if (!Array.isArray(ids) || ids.length > 200 || !ids.every((i) => typeof i === "string" && UUID.test(i))) return { error: GENERIC_ERROR };
  const supabase = await createSessionClient();
  const { data: current, error } = await supabase.from("services").select("id, sort");
  if (error) return { error: GENERIC_ERROR };
  const sortOf = new Map((current ?? []).map((s) => [s.id, s.sort]));
  for (const [index, id] of ids.entries()) {
    const sort = (index + 1) * 10;
    if (sortOf.get(id) === sort) continue;
    const r = await supabase.from("services").update({ sort }).eq("id", id);
    if (r.error) return { error: GENERIC_ERROR };
  }
  updateTag("site-content");
  refresh();
  return { error: null };
}
