"use server";

import { refresh, updateTag } from "next/cache";
import { requireStaff } from "@/lib/auth/staff";
import { nextSaveState as state, type SaveState } from "@/lib/dashboard/action-state";
import { parseHoursForm } from "@/lib/domain/hours";
import {
  bookingRulesSchema, bookingsOutsideHours, CLOSURE_TAKEN, closureDateProblem, closureSchema, closureWarning, googleSchema,
  hoursChangeWarning, onlineBookingSchema, publicThemeSchema, websiteNotesSchema,
} from "@/lib/domain/settings";
import { NOT_ALLOWED_ERROR } from "@/lib/domain/staff-bookings";
import { addDays, dateKey, fromLondon } from "@/lib/domain/time";
import { fieldErrors, GENERIC_ERROR } from "@/lib/domain/validation";
import type { Database } from "@/lib/supabase/database.types";
import { createSessionClient } from "@/lib/supabase/server";

/**
 * Settings (spec §8.8), owner/admin only (RLS too). One card per topic, each saved separately. Everything here
 * shows on the website or changes online booking, so every save refreshes the site's cache. Changing hours or
 * closing a day never moves existing bookings: the form warns first and asks to confirm.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPEN = ["pending", "confirmed"] as const;

const fail = (prev: SaveState, error: string, fields: Record<string, string> = {}) => state(prev, { error, fields });

function saved(prev: SaveState, notice: string): SaveState {
  updateTag("site-content");
  refresh();
  return state(prev, { done: { notice } });
}

type SettingsUpdate = Database["public"]["Tables"]["settings"]["Update"];

/** Updates the single settings row. No row back means RLS refused it. */
async function updateSettings(prev: SaveState, values: SettingsUpdate, notice: string): Promise<SaveState> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.from("settings").update(values).eq("id", 1).select("id").maybeSingle();
  if (error) return fail(prev, error.code === "42501" ? NOT_ALLOWED_ERROR : GENERIC_ERROR);
  if (!data) return fail(prev, NOT_ALLOWED_ERROR);
  return saved(prev, notice);
}

export async function saveOpeningHours(prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireStaff(["owner", "admin"]);
  const parsed = parseHoursForm((name) => formData.get(name) as string | null);
  if (!parsed.ok) return fail(prev, "Please check the hours.", parsed.errors);

  if (formData.get("anyway") !== "1") {
    const supabase = await createSessionClient();
    const { data, error } = await supabase
      .from("bookings")
      .select("starts_at, ends_at")
      .in("status", OPEN)
      .gte("starts_at", new Date().toISOString());
    if (error) return fail(prev, GENERIC_ERROR);
    const outside = bookingsOutsideHours(
      parsed.hours,
      (data ?? []).map((b) => ({ startsAt: new Date(b.starts_at), endsAt: new Date(b.ends_at) })),
    );
    const warning = hoursChangeWarning(outside);
    if (warning) return state(prev, { warning });
  }
  return updateSettings(prev, { shop_hours: parsed.hours }, "Opening hours saved.");
}

export async function addClosure(prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireStaff(["owner", "admin"]);
  const parsed = closureSchema.safeParse({ closedOn: formData.get("closedOn") ?? "", reason: formData.get("reason") ?? "" });
  if (!parsed.success) return fail(prev, "Please check the date.", fieldErrors(parsed.error));
  const { closedOn, reason } = parsed.data;
  const problem = closureDateProblem(closedOn, dateKey(new Date()));
  if (problem) return fail(prev, "Please check the date.", { closedOn: problem });

  const supabase = await createSessionClient();
  if (formData.get("anyway") !== "1") {
    const { count, error } = await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .in("status", OPEN)
      .gte("starts_at", fromLondon(closedOn, 0).toISOString())
      .lt("starts_at", fromLondon(addDays(closedOn, 1), 0).toISOString());
    if (error) return fail(prev, GENERIC_ERROR);
    const warning = closureWarning(count ?? 0);
    if (warning) return state(prev, { warning });
  }
  const { error } = await supabase.from("closures").insert({ closed_on: closedOn, reason: reason || null });
  if (error?.code === "23505") return fail(prev, "Please check the date.", { closedOn: CLOSURE_TAKEN });
  if (error) return fail(prev, error.code === "42501" ? NOT_ALLOWED_ERROR : GENERIC_ERROR);
  return saved(prev, "Closed day added.");
}

export async function removeClosure(prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireStaff(["owner", "admin"]);
  const id = formData.get("closureId");
  if (typeof id !== "string" || !UUID.test(id)) return fail(prev, GENERIC_ERROR);
  const supabase = await createSessionClient();
  const { data, error } = await supabase.from("closures").delete().eq("id", id).select("id");
  if (error || !data?.length) return fail(prev, error ? GENERIC_ERROR : NOT_ALLOWED_ERROR);
  return saved(prev, "Closed day removed.");
}

export async function saveBookingRules(prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireStaff(["owner", "admin"]);
  const parsed = bookingRulesSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(prev, "Please check the booking rules.", fieldErrors(parsed.error));
  const v = parsed.data;
  return updateSettings(
    prev,
    {
      min_notice_minutes: v.minNoticeMinutes,
      booking_window_days: v.bookingWindowDays,
      due_back_weeks: v.dueBackWeeks,
      max_open_requests: v.maxOpenRequests,
      change_cutoff_minutes: v.changeCutoffMinutes,
    },
    "Booking rules saved.",
  );
}

export async function saveGoogle(prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireStaff(["owner", "admin"]);
  const parsed = googleSchema.safeParse({
    rating: formData.get("rating") ?? "",
    count: formData.get("count") ?? "",
    url: formData.get("url") ?? "",
  });
  if (!parsed.success) return fail(prev, "Please check the Google details.", fieldErrors(parsed.error));
  const v = parsed.data;
  return updateSettings(
    prev,
    { google_rating: v.rating, google_review_count: v.count, google_review_url: v.url },
    v.rating === null ? "Google rating hidden." : "Google rating saved.",
  );
}

export async function saveWebsiteNotes(prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireStaff(["owner", "admin"]);
  const parsed = websiteNotesSchema.safeParse({ walkInText: formData.get("walkInText") ?? "", discountText: formData.get("discountText") ?? "" });
  if (!parsed.success) return fail(prev, "Please check the website notes.", fieldErrors(parsed.error));
  return updateSettings(prev, { walk_in_text: parsed.data.walkInText, discount_text: parsed.data.discountText }, "Website notes saved.");
}

export async function savePublicTheme(prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireStaff(["owner", "admin"]);
  const parsed = publicThemeSchema.safeParse({ publicTheme: formData.get("publicTheme") });
  if (!parsed.success) return fail(prev, "Please choose Light or Dark.", { publicTheme: "Please choose Light or Dark." });
  return updateSettings(prev, { public_theme: parsed.data.publicTheme }, "Website theme saved.");
}

export async function saveOnlineBooking(prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireStaff(["owner", "admin"]);
  const parsed = onlineBookingSchema.safeParse({ onlineBooking: formData.get("onlineBooking") });
  if (!parsed.success) return fail(prev, "Please choose On or Off.", { onlineBooking: "Please choose On or Off." });
  const on = parsed.data.onlineBooking === "on";
  return updateSettings(prev, { online_booking: on }, on ? "Online booking is on." : "Online booking is off.");
}
