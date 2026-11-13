"use server";

import { refresh, updateTag } from "next/cache";
import { requireStaff } from "@/lib/auth/staff";
import { nextSaveState as state, type SaveState } from "@/lib/dashboard/action-state";
import { NOT_ALLOWED_ERROR } from "@/lib/domain/staff-bookings";
import { dateKey } from "@/lib/domain/time";
import { fieldErrors, GENERIC_ERROR } from "@/lib/domain/validation";
import {
  ALT_ERROR, cleanAlt, isPhotoSet, PHOTO_SET_LABELS, reviewSchema, setFullMessage, startsVisible, type PhotoSet,
} from "@/lib/domain/website";
import { MAX_PHOTO_BYTES, NotAnImageError, PHOTO_MAX_SIZE, processPhoto } from "@/lib/images/process";
import { createSessionClient } from "@/lib/supabase/server";

/**
 * Website content (spec §8.7), owner/admin only (RLS and storage policies too). Photos are re-encoded on the
 * server (WebP ≤ 2 MB, upright, no location data); replacing or deleting a photo deletes its file. Every change
 * refreshes the website's cache.
 */

type Supabase = Awaited<ReturnType<typeof createSessionClient>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUCKET = "gallery";
/** Uploads are shrunk in the browser first; this is the server's own limit. */
const MAX_UPLOAD = 5 * 1024 * 1024;

const fail = (prev: SaveState, error: string, fields: Record<string, string> = {}) => state(prev, { error, fields });

function saved(prev: SaveState, notice: string): SaveState {
  updateTag("site-content");
  refresh();
  return state(prev, { done: { notice } });
}

function dbError(error: { code?: string; message?: string; hint?: string } | null): string {
  if (!error) return NOT_ALLOWED_ERROR;
  if (error.code === "42501") return NOT_ALLOWED_ERROR;
  if (error.message?.includes("gallery_full") && isPhotoSet(error.hint)) return setFullMessage(error.hint);
  return GENERIC_ERROR;
}

type Upload = { ok: true; path: string } | { ok: false; error: string };

/** Re-encodes the chosen photo and stores it under `folder/`. */
async function uploadPhoto(supabase: Supabase, file: FormDataEntryValue | null, folder: "photos" | "shop"): Promise<Upload> {
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Please choose a photo." };
  if (file.size > MAX_UPLOAD) return { ok: false, error: "That photo is too big. Please choose one under 5 MB." };
  let photo;
  try {
    photo = await processPhoto(Buffer.from(await file.arrayBuffer()), PHOTO_MAX_SIZE.gallery);
  } catch (e) {
    if (e instanceof NotAnImageError) return { ok: false, error: e.message };
    throw e;
  }
  if (photo.bytes > MAX_PHOTO_BYTES) return { ok: false, error: "That photo is too big." };
  const path = `${folder}/${crypto.randomUUID()}.webp`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, photo.buffer, { contentType: "image/webp", cacheControl: "31536000", upsert: false });
  if (error) return { ok: false, error: GENERIC_ERROR };
  return { ok: true, path };
}

const removeFile = (supabase: Supabase, path: string | null | undefined) => (path ? supabase.storage.from(BUCKET).remove([path]) : null);

function parseId(value: FormDataEntryValue | null): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

// ---------------------------------------------------------------------------
// Shop photo (settings.shop_photo_path)
// ---------------------------------------------------------------------------

export async function saveShopPhoto(prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireStaff(["owner", "admin"]);
  const supabase = await createSessionClient();
  const { data: current, error: readError } = await supabase.from("settings").select("shop_photo_path").eq("id", 1).single();
  if (readError) return fail(prev, GENERIC_ERROR);
  const upload = await uploadPhoto(supabase, formData.get("photo"), "shop");
  if (!upload.ok) return fail(prev, upload.error, { photo: upload.error });
  const { data, error } = await supabase.from("settings").update({ shop_photo_path: upload.path }).eq("id", 1).select("id").maybeSingle();
  if (error || !data) {
    await removeFile(supabase, upload.path);
    return fail(prev, dbError(error));
  }
  await removeFile(supabase, current.shop_photo_path);
  return saved(prev, "Shop photo saved.");
}

export async function removeShopPhoto(prev: SaveState): Promise<SaveState> {
  await requireStaff(["owner", "admin"]);
  const supabase = await createSessionClient();
  const { data: current } = await supabase.from("settings").select("shop_photo_path").eq("id", 1).single();
  if (!current?.shop_photo_path) return saved(prev, "No shop photo to remove.");
  const { data, error } = await supabase.from("settings").update({ shop_photo_path: null }).eq("id", 1).select("id").maybeSingle();
  if (error || !data) return fail(prev, dbError(error));
  await removeFile(supabase, current.shop_photo_path);
  return saved(prev, "Shop photo removed.");
}

// ---------------------------------------------------------------------------
// Gallery photos: Slideshow (in_hero) and Recent cuts
// ---------------------------------------------------------------------------

async function visibleCount(supabase: Supabase, set: PhotoSet, exceptId?: string): Promise<number> {
  let q = supabase.from("gallery_photos").select("id", { count: "exact", head: true }).eq("visible", true).eq("in_hero", set === "slideshow");
  if (exceptId) q = q.neq("id", exceptId);
  const { count } = await q;
  return count ?? 0;
}

export async function addPhoto(prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireStaff(["owner", "admin"]);
  const set = formData.get("set");
  if (!isPhotoSet(set)) return fail(prev, GENERIC_ERROR);
  const alt = cleanAlt(String(formData.get("alt") ?? ""));
  const file = formData.get("photo");
  const fields: Record<string, string> = {};
  if (!alt) fields.alt = ALT_ERROR;
  if (!(file instanceof File) || file.size === 0) fields.photo = "Please choose a photo.";
  if (Object.keys(fields).length) return fail(prev, "Please check the photo and its description.", fields);

  const supabase = await createSessionClient();
  const upload = await uploadPhoto(supabase, file, "photos");
  if (!upload.ok) return fail(prev, upload.error, { photo: upload.error });

  const child = formData.get("child") === "on";
  const visible = startsVisible({ set, visibleInSet: await visibleCount(supabase, set), child });
  const { data: last } = await supabase.from("gallery_photos").select("sort").eq("in_hero", set === "slideshow").order("sort", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase
    .from("gallery_photos")
    .insert({ path: upload.path, alt: alt!, in_hero: set === "slideshow", visible, sort: (last?.sort ?? 0) + 10 });
  if (error) {
    await removeFile(supabase, upload.path);
    return fail(prev, dbError(error));
  }
  const where = PHOTO_SET_LABELS[set];
  return saved(prev, visible ? `Photo added to ${where}.` : `Photo added to ${where}, hidden.`);
}

/** Description, section and shown/hidden. Moving into a full section keeps the photo hidden. */
export async function updatePhoto(prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireStaff(["owner", "admin"]);
  const id = parseId(formData.get("id"));
  const set = formData.get("set");
  if (!id || !isPhotoSet(set)) return fail(prev, GENERIC_ERROR);
  const alt = cleanAlt(String(formData.get("alt") ?? ""));
  if (!alt) return fail(prev, "Please check the description.", { alt: ALT_ERROR });
  const supabase = await createSessionClient();
  const { data: current } = await supabase.from("gallery_photos").select("in_hero, sort").eq("id", id).maybeSingle();
  if (!current) return fail(prev, NOT_ALLOWED_ERROR);
  const inHero = set === "slideshow";
  const values: { alt: string; in_hero: boolean; visible: boolean; sort?: number } = { alt, in_hero: inHero, visible: formData.get("visible") === "on" };
  if (current.in_hero !== inHero) {
    // Moved: goes to the end of the other section.
    const { data: last } = await supabase.from("gallery_photos").select("sort").eq("in_hero", inHero).order("sort", { ascending: false }).limit(1).maybeSingle();
    values.sort = (last?.sort ?? 0) + 10;
  }
  const { data, error } = await supabase.from("gallery_photos").update(values).eq("id", id).select("id").maybeSingle();
  if (error || !data) return fail(prev, dbError(error), error?.message?.includes("gallery_full") ? { visible: dbError(error) } : {});
  return saved(prev, "Photo saved.");
}

/** Quick show/hide from the list. */
export async function setPhotoVisible(prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireStaff(["owner", "admin"]);
  const id = parseId(formData.get("id"));
  if (!id) return fail(prev, GENERIC_ERROR);
  const visible = formData.get("visible") === "1";
  const supabase = await createSessionClient();
  const { data, error } = await supabase.from("gallery_photos").update({ visible }).eq("id", id).select("id").maybeSingle();
  if (error || !data) return fail(prev, dbError(error));
  return saved(prev, visible ? "Photo shown on the website." : "Photo hidden from the website.");
}

export async function replacePhoto(prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireStaff(["owner", "admin"]);
  const id = parseId(formData.get("id"));
  if (!id) return fail(prev, GENERIC_ERROR);
  const supabase = await createSessionClient();
  const { data: current } = await supabase.from("gallery_photos").select("path").eq("id", id).maybeSingle();
  if (!current) return fail(prev, NOT_ALLOWED_ERROR);
  const upload = await uploadPhoto(supabase, formData.get("photo"), "photos");
  if (!upload.ok) return fail(prev, upload.error, { photo: upload.error });
  const { data, error } = await supabase.from("gallery_photos").update({ path: upload.path }).eq("id", id).select("id").maybeSingle();
  if (error || !data) {
    await removeFile(supabase, upload.path);
    return fail(prev, dbError(error));
  }
  await removeFile(supabase, current.path);
  return saved(prev, "Photo replaced.");
}

export async function deletePhoto(prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireStaff(["owner", "admin"]);
  const id = parseId(formData.get("id"));
  if (!id) return fail(prev, GENERIC_ERROR);
  const supabase = await createSessionClient();
  const { data, error } = await supabase.from("gallery_photos").delete().eq("id", id).select("path");
  if (error || !data?.length) return fail(prev, dbError(error));
  await removeFile(supabase, data[0].path);
  return saved(prev, "Photo deleted.");
}

/** New order of one section (ids top to bottom); only moved rows are written. */
export async function reorderPhotos(ids: string[]): Promise<{ error: string | null }> {
  await requireStaff(["owner", "admin"]);
  return reorder("gallery_photos", ids);
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

export async function saveReview(prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireStaff(["owner", "admin"]);
  const parsed = reviewSchema.safeParse({
    authorName: formData.get("authorName") ?? "",
    body: formData.get("body") ?? "",
    stars: formData.get("stars"),
    reviewDate: formData.get("reviewDate") ?? "",
    isGoogle: formData.get("isGoogle"),
    visible: formData.get("visible"),
  });
  if (!parsed.success) return fail(prev, "Please check the review.", fieldErrors(parsed.error));
  const v = parsed.data;
  if (v.reviewDate && v.reviewDate > dateKey(new Date())) {
    return fail(prev, "Please check the review.", { reviewDate: "The date can't be in the future." });
  }
  const values = { author_name: v.authorName, body: v.body, stars: v.stars, review_date: v.reviewDate, is_google: v.isGoogle, visible: v.visible };
  const supabase = await createSessionClient();
  const id = parseId(formData.get("id"));
  if (id) {
    const { data, error } = await supabase.from("reviews").update(values).eq("id", id).select("id").maybeSingle();
    if (error || !data) return fail(prev, dbError(error));
    return saved(prev, "Review saved.");
  }
  const { data: last } = await supabase.from("reviews").select("sort").order("sort", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase.from("reviews").insert({ ...values, sort: (last?.sort ?? 0) + 10 });
  if (error) return fail(prev, dbError(error));
  return saved(prev, "Review added.");
}

export async function deleteReview(prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireStaff(["owner", "admin"]);
  const id = parseId(formData.get("id"));
  if (!id) return fail(prev, GENERIC_ERROR);
  const supabase = await createSessionClient();
  const { data, error } = await supabase.from("reviews").delete().eq("id", id).select("id");
  if (error || !data?.length) return fail(prev, dbError(error));
  return saved(prev, "Review deleted.");
}

export async function reorderReviews(ids: string[]): Promise<{ error: string | null }> {
  await requireStaff(["owner", "admin"]);
  return reorder("reviews", ids);
}

async function reorder(table: "gallery_photos" | "reviews", ids: string[]): Promise<{ error: string | null }> {
  if (!Array.isArray(ids) || ids.length > 200 || !ids.every((i) => typeof i === "string" && UUID.test(i))) return { error: GENERIC_ERROR };
  const supabase = await createSessionClient();
  const { data: current, error } = await supabase.from(table).select("id, sort").in("id", ids);
  if (error) return { error: GENERIC_ERROR };
  const sortOf = new Map((current ?? []).map((r) => [r.id, r.sort]));
  for (const [index, id] of ids.entries()) {
    const sort = (index + 1) * 10;
    if (sortOf.get(id) === sort) continue;
    const r = await supabase.from(table).update({ sort }).eq("id", id);
    if (r.error) return { error: GENERIC_ERROR };
  }
  updateTag("site-content");
  refresh();
  return { error: null };
}
