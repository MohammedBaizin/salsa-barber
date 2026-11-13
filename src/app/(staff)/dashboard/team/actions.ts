"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff, type Staff } from "@/lib/auth/staff";
import { tempPassword } from "@/lib/auth/temp-password";
import { parseHoursForm } from "@/lib/domain/hours";
import {
  canChangeRole, canDelete, canEditPerson, canResetPassword, canSwitchOff, creatableRoles, isManager, loginEmail, newPersonSchema,
  profileSchema, switchOffWarning, TEAM_ERRORS, timeOffSchema, timeOffWarning, USERNAME_TAKEN, type Role,
} from "@/lib/domain/team";
import { addDays, fromLondon } from "@/lib/domain/time";
import { fieldErrors, GENERIC_ERROR } from "@/lib/domain/validation";
import { MAX_PHOTO_BYTES, NotAnImageError, PHOTO_MAX_SIZE, processPhoto } from "@/lib/images/process";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSessionClient } from "@/lib/supabase/server";
import { nextSaveState, type SaveState } from "@/lib/dashboard/action-state";

/**
 * Team actions (spec §8.5). Every action checks the permission rules in domain/team.ts against the target's real
 * role; RLS and the staff trigger enforce the same rules again in the database. Changes that show on the website
 * (names, photos, who's shown or bookable, services, hours) refresh the site's cache.
 */

export type TeamFormState = SaveState;

const state = nextSaveState;
const fail = (prev: TeamFormState, error: string, fields: Record<string, string> = {}) => state(prev, { error, fields });

function teamError(error: { code?: string; message?: string } | null): string {
  if (!error) return GENERIC_ERROR;
  if (error.code === "42501") return TEAM_ERRORS.not_allowed;
  const code = Object.keys(TEAM_ERRORS).find((c) => error.message?.includes(c));
  return code ? TEAM_ERRORS[code] : GENERIC_ERROR;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Target = { id: string; role: Role; userId: string | null; name: string; photoPath: string | null };

/** The person being changed, read through RLS (owners never see admin accounts). */
async function loadTarget(supabase: Awaited<ReturnType<typeof createSessionClient>>, id: unknown): Promise<Target | null> {
  if (typeof id !== "string" || !UUID.test(id)) return null;
  const { data } = await supabase
    .from("staff")
    .select("id, role, user_id, display_name, photo_path")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  return data ? { id: data.id, role: data.role as Role, userId: data.user_id, name: data.display_name, photoPath: data.photo_path } : null;
}

const actorOf = (staff: Staff) => ({ id: staff.id, role: staff.role });

function changed(notice: string, prev: TeamFormState, website = true): TeamFormState {
  if (website) updateTag("site-content");
  refresh();
  return state(prev, { done: { notice } });
}

// ---------------------------------------------------------------------------
// New person
// ---------------------------------------------------------------------------

/**
 * Login created with the secret key (<username>@<staff domain>), profile inserted with the signed-in person's
 * session (RLS + audit apply), login removed again if the profile can't be saved. New people start hidden from
 * the website and not taking bookings, with the shop's hours and every service. The temporary password is
 * returned once.
 */
export async function createPerson(prev: TeamFormState, formData: FormData): Promise<TeamFormState> {
  const staff = await requireStaff(["owner", "admin"]);
  const parsed = newPersonSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(prev, "Please check the details.", fieldErrors(parsed.error));
  const { username, displayName, role } = parsed.data;
  if (!creatableRoles(staff).includes(role)) return fail(prev, TEAM_ERRORS.not_allowed);

  const admin = createAdminClient();
  const { data: taken } = await admin.from("staff").select("id").eq("username", username).maybeSingle();
  if (taken) return fail(prev, USERNAME_TAKEN, { username: USERNAME_TAKEN });

  const supabase = await createSessionClient();
  const [{ data: settings }, { data: services }, { data: last }] = await Promise.all([
    supabase.from("settings").select("shop_hours").eq("id", 1).single(),
    supabase.from("services").select("id").eq("active", true),
    supabase.from("staff").select("sort").order("sort", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const password = tempPassword();
  const { data: login, error: loginError } = await admin.auth.admin.createUser({ email: loginEmail(username), password, email_confirm: true });
  if (loginError || !login.user) {
    return /already/i.test(loginError?.message ?? "") ? fail(prev, USERNAME_TAKEN, { username: USERNAME_TAKEN }) : fail(prev, GENERIC_ERROR);
  }

  const { data: profile, error: profileError } = await supabase
    .from("staff")
    .insert({
      username,
      display_name: displayName,
      role,
      bookable: false,
      show_on_site: false,
      title: role === "barber" ? "Barber" : null,
      weekly_hours: role === "admin" ? {} : (settings?.shop_hours ?? {}),
      sort: (last?.sort ?? 0) + 10,
    })
    .select("id")
    .single();
  if (profileError || !profile) {
    await admin.auth.admin.deleteUser(login.user.id);
    return fail(prev, profileError?.code === "23505" ? USERNAME_TAKEN : teamError(profileError));
  }

  // Linking the login is a trusted step (signed-in staff can never move logins between profiles).
  const { error: linkError } = await admin.from("staff").update({ user_id: login.user.id }).eq("id", profile.id);
  if (linkError) {
    await admin.from("staff").delete().eq("id", profile.id);
    await admin.auth.admin.deleteUser(login.user.id);
    return fail(prev, GENERIC_ERROR);
  }
  if (role !== "admin" && services?.length) {
    await supabase.from("staff_services").insert(services.map((s) => ({ staff_id: profile.id, service_id: s.id })));
  }

  refresh();
  return state(prev, { done: { notice: `${displayName} added.`, password, id: profile.id } });
}

// ---------------------------------------------------------------------------
// Profile, photo, services, hours, time off
// ---------------------------------------------------------------------------

export async function saveProfile(prev: TeamFormState, formData: FormData): Promise<TeamFormState> {
  const staff = await requireStaff(["owner", "admin"]);
  const supabase = await createSessionClient();
  const target = await loadTarget(supabase, formData.get("id"));
  if (!target || !canEditPerson(actorOf(staff), target)) return fail(prev, TEAM_ERRORS.not_allowed);
  const parsed = profileSchema.safeParse({
    displayName: formData.get("displayName"),
    title: formData.get("title") ?? "",
    bio: formData.get("bio") ?? "",
    bookable: formData.get("bookable") === "on",
    showOnSite: formData.get("showOnSite") === "on",
  });
  if (!parsed.success) return fail(prev, "Please check the details.", fieldErrors(parsed.error));
  const p = parsed.data;
  const isAdminTarget = target.role === "admin";
  const { error } = await supabase
    .from("staff")
    .update({
      display_name: p.displayName,
      title: p.title || null,
      bio: p.bio || null,
      // The admin account is never a barber and never on the website.
      bookable: isAdminTarget ? false : p.bookable,
      show_on_site: isAdminTarget ? false : p.showOnSite,
    })
    .eq("id", target.id);
  if (error) return fail(prev, teamError(error));
  return changed("Profile saved.", prev);
}

export async function savePhoto(prev: TeamFormState, formData: FormData): Promise<TeamFormState> {
  const staff = await requireStaff(["owner", "admin"]);
  const supabase = await createSessionClient();
  const target = await loadTarget(supabase, formData.get("id"));
  if (!target || !canEditPerson(actorOf(staff), target)) return fail(prev, TEAM_ERRORS.not_allowed);

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return fail(prev, "Please choose a photo.", { photo: "Please choose a photo." });
  if (file.size > 5 * 1024 * 1024) return fail(prev, "That photo is too big (over 5 MB).", { photo: "Please choose a photo under 5 MB." });

  let photo;
  try {
    photo = await processPhoto(Buffer.from(await file.arrayBuffer()), PHOTO_MAX_SIZE.team);
  } catch (e) {
    if (e instanceof NotAnImageError) return fail(prev, "That file isn't a photo we can read. Try a JPEG or PNG.", { photo: "Please choose a JPEG, PNG or WebP photo." });
    throw e;
  }
  if (photo.bytes > MAX_PHOTO_BYTES) return fail(prev, "That photo is too big.");

  const path = `staff/${target.id}/${crypto.randomUUID()}.webp`;
  const { error: uploadError } = await supabase.storage
    .from("team")
    .upload(path, photo.buffer, { contentType: "image/webp", cacheControl: "31536000", upsert: false });
  if (uploadError) return fail(prev, GENERIC_ERROR);

  const { error } = await supabase.from("staff").update({ photo_path: path }).eq("id", target.id);
  if (error) {
    await supabase.storage.from("team").remove([path]);
    return fail(prev, teamError(error));
  }
  if (target.photoPath) await supabase.storage.from("team").remove([target.photoPath]);
  return changed("Photo saved.", prev);
}

export async function removePhoto(prev: TeamFormState, formData: FormData): Promise<TeamFormState> {
  const staff = await requireStaff(["owner", "admin"]);
  const supabase = await createSessionClient();
  const target = await loadTarget(supabase, formData.get("id"));
  if (!target || !canEditPerson(actorOf(staff), target)) return fail(prev, TEAM_ERRORS.not_allowed);
  if (!target.photoPath) return changed("No photo to remove.", prev, false);
  const { error } = await supabase.from("staff").update({ photo_path: null }).eq("id", target.id);
  if (error) return fail(prev, teamError(error));
  await supabase.storage.from("team").remove([target.photoPath]);
  return changed("Photo removed.", prev);
}

export async function saveServices(prev: TeamFormState, formData: FormData): Promise<TeamFormState> {
  const staff = await requireStaff(["owner", "admin"]);
  const supabase = await createSessionClient();
  const target = await loadTarget(supabase, formData.get("id"));
  if (!target || !canEditPerson(actorOf(staff), target) || target.role === "admin") return fail(prev, TEAM_ERRORS.not_allowed);

  const wanted = new Set(formData.getAll("service").map(String).filter((v) => UUID.test(v)));
  const { data: current, error } = await supabase.from("staff_services").select("service_id").eq("staff_id", target.id);
  if (error) return fail(prev, GENERIC_ERROR);
  const have = new Set((current ?? []).map((c) => c.service_id));
  const add = [...wanted].filter((s) => !have.has(s));
  const remove = [...have].filter((s) => !wanted.has(s));
  if (add.length) {
    const r = await supabase.from("staff_services").insert(add.map((service_id) => ({ staff_id: target.id, service_id })));
    if (r.error) return fail(prev, teamError(r.error));
  }
  if (remove.length) {
    const r = await supabase.from("staff_services").delete().eq("staff_id", target.id).in("service_id", remove);
    if (r.error) return fail(prev, teamError(r.error));
  }
  return changed("Services saved.", prev);
}

export async function saveHours(prev: TeamFormState, formData: FormData): Promise<TeamFormState> {
  const staff = await requireStaff(["owner", "admin"]);
  const supabase = await createSessionClient();
  const target = await loadTarget(supabase, formData.get("id"));
  if (!target || !canEditPerson(actorOf(staff), target)) return fail(prev, TEAM_ERRORS.not_allowed);
  const parsed = parseHoursForm((name) => formData.get(name) as string | null);
  if (!parsed.ok) return fail(prev, "Please check the hours.", parsed.errors);
  const { error } = await supabase.from("staff").update({ weekly_hours: parsed.hours }).eq("id", target.id);
  if (error) return fail(prev, teamError(error));
  return changed("Working hours saved.", prev);
}

export async function addTimeOff(prev: TeamFormState, formData: FormData): Promise<TeamFormState> {
  const staff = await requireStaff(["owner", "admin"]);
  const parsed = timeOffSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(prev, "Please check the dates.", fieldErrors(parsed.error));
  const v = parsed.data;
  const supabase = await createSessionClient();
  const target = await loadTarget(supabase, v.staffId);
  if (!target || !canEditPerson(actorOf(staff), target)) return fail(prev, TEAM_ERRORS.not_allowed);

  if (!v.anyway) {
    const { count } = await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("staff_id", target.id)
      .in("status", ["pending", "confirmed"])
      .gte("starts_at", fromLondon(v.startsOn, 0).toISOString())
      .lt("starts_at", fromLondon(addDays(v.endsOn, 1), 0).toISOString());
    const warning = timeOffWarning(count ?? 0);
    if (warning) return state(prev, { warning });
  }
  const { error } = await supabase.from("time_off").insert({ staff_id: target.id, starts_on: v.startsOn, ends_on: v.endsOn, reason: v.reason });
  if (error) return fail(prev, teamError(error));
  return changed("Time off added.", prev);
}

export async function removeTimeOff(prev: TeamFormState, formData: FormData): Promise<TeamFormState> {
  await requireStaff(["owner", "admin"]);
  const id = formData.get("timeOffId");
  if (typeof id !== "string" || !UUID.test(id)) return fail(prev, GENERIC_ERROR);
  const supabase = await createSessionClient();
  // RLS: only owner/admin can delete time off.
  const { data, error } = await supabase.from("time_off").delete().eq("id", id).select("id");
  if (error || !data?.length) return fail(prev, error ? teamError(error) : TEAM_ERRORS.not_allowed);
  return changed("Time off removed.", prev);
}

// ---------------------------------------------------------------------------
// Account: role, password, switch off/on, delete
// ---------------------------------------------------------------------------

export async function changeRole(prev: TeamFormState, formData: FormData): Promise<TeamFormState> {
  const staff = await requireStaff(["admin"]);
  const supabase = await createSessionClient();
  const target = await loadTarget(supabase, formData.get("id"));
  const role = formData.get("role");
  if (!target || !canChangeRole(actorOf(staff), target)) return fail(prev, TEAM_ERRORS.not_allowed);
  if (role !== "barber" && role !== "owner" && role !== "admin") return fail(prev, GENERIC_ERROR);
  if (role === target.role) return state(prev, { done: { notice: "No change." } });
  const { error } = await supabase
    .from("staff")
    .update(role === "admin" ? { role, bookable: false, show_on_site: false } : { role })
    .eq("id", target.id);
  if (error) return fail(prev, teamError(error));
  return changed("Role changed.", prev);
}

/** New temporary password (shown once); signs them out everywhere; logged. */
export async function resetPassword(prev: TeamFormState, formData: FormData): Promise<TeamFormState> {
  const staff = await requireStaff(["owner", "admin"]);
  const supabase = await createSessionClient();
  const target = await loadTarget(supabase, formData.get("id"));
  if (!target || !canResetPassword(actorOf(staff), target) || !target.userId) return fail(prev, TEAM_ERRORS.not_allowed);

  const password = tempPassword();
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(target.userId, { password });
  if (error) return fail(prev, GENERIC_ERROR);
  await admin.rpc("end_user_sessions", { p_user: target.userId });
  await supabase.rpc("log_account_event", { p_action: "account.password_reset", p_staff: target.id });
  return state(prev, { done: { notice: `New password for ${target.name}.`, password } });
}

export async function setActive(prev: TeamFormState, formData: FormData): Promise<TeamFormState> {
  const staff = await requireStaff(["owner", "admin"]);
  const supabase = await createSessionClient();
  const target = await loadTarget(supabase, formData.get("id"));
  if (!target || !canSwitchOff(actorOf(staff), target)) return fail(prev, TEAM_ERRORS.not_allowed);
  const active = formData.get("active") === "1";

  if (!active && formData.get("anyway") !== "1") {
    const { count } = await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("staff_id", target.id)
      .in("status", ["pending", "confirmed"])
      .gt("ends_at", new Date().toISOString());
    const warning = switchOffWarning(target.name, count ?? 0);
    if (warning) return state(prev, { warning });
  }

  const { error } = await supabase.from("staff").update({ active }).eq("id", target.id);
  if (error) return fail(prev, teamError(error));
  // Switched off: signed out everywhere now (requireStaff would also stop them on their next click).
  if (!active && target.userId) await createAdminClient().rpc("end_user_sessions", { p_user: target.userId });
  return changed(active ? `${target.name} switched back on.` : `${target.name} switched off.`, prev);
}

export async function deleteAccount(prev: TeamFormState, formData: FormData): Promise<TeamFormState> {
  const staff = await requireStaff(["owner", "admin"]);
  if (!isManager(staff)) return fail(prev, TEAM_ERRORS.not_allowed);
  const supabase = await createSessionClient();
  const target = await loadTarget(supabase, formData.get("id"));
  if (!target || !canDelete(actorOf(staff), target, 0)) return fail(prev, TEAM_ERRORS.not_allowed);

  // delete_staff() re-checks everything under the booking lock (including upcoming bookings).
  const { data, error } = await supabase.rpc("delete_staff", { p_id: target.id });
  if (error) return fail(prev, teamError(error));
  const result = data?.[0];
  const admin = createAdminClient();
  if (result?.user_id) await admin.auth.admin.deleteUser(result.user_id);
  if (result?.photo_path) await admin.storage.from("team").remove([result.photo_path]);
  updateTag("site-content");
  redirect("/dashboard/team?deleted=1");
}
