#!/usr/bin/env node
/**
 * Imports the chosen website photos (scripts/photos-selection.json) into Supabase Storage + gallery_photos,
 * and sets the shop photo. Photos are re-encoded with the same pipeline as dashboard uploads.
 *
 *   npm run photos:import                    local (.env.local)
 *   npm run photos:import -- --if-empty      only when the gallery is empty (used by test:e2e)
 *   npm run photos:import -- --replace       remove existing website photos first
 *   npm run photos:import:prod               production (.env.production.local)
 *   npm run photos:import -- --team          only the team photos (works when the gallery already has photos)
 *
 * Team photos are matched to a staff member by role ("owner") or by display name. Locally, where staff are SAMPLE
 * people, an entry's `sample` name is used when the real one isn't found, so the photos can be previewed.
 *
 * Source files: photos/converted/<file> (JPEG/PNG/WebP). iPhone HEIC files need converting first;
 * dashboard uploads convert HEIC in the browser.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { PHOTO_MAX_SIZE, processPhoto } from "../src/lib/images/process.ts";

type Entry = { file: string; alt: string };
type TeamEntry = { file: string; name: string; role?: "owner"; sample?: string };
type Selection = { shop?: Entry; slideshow: Entry[]; recentCuts: Entry[]; team?: TeamEntry[] };

const args = new Set(process.argv.slice(2));
const prod = args.has("--prod");
const envFile = prod ? ".env.production.local" : ".env.local";
process.loadEnvFile(envFile);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const secret = process.env.SUPABASE_SECRET_KEY!;
if (!url || !secret) throw new Error(`${envFile} needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY`);

const supabase = createClient(url, secret, { auth: { persistSession: false } });
const root = path.resolve(import.meta.dirname, "..");
const sourceDir = path.join(root, "photos", "converted");
const selection = JSON.parse(await readFile(path.join(root, "scripts", "photos-selection.json"), "utf8")) as Selection;

async function importTeam(entries: TeamEntry[]) {
  for (const entry of entries) {
    const { data: staff, error } = await supabase.from("staff").select("id, display_name, role, photo_path");
    if (error) throw error;
    const byName = (name: string) => staff.filter((s) => s.display_name.trim().toLowerCase() === name.toLowerCase());
    let matches = entry.role ? staff.filter((s) => s.role === entry.role) : byName(entry.name);
    if (matches.length === 0 && !prod && entry.sample) matches = byName(entry.sample);
    if (matches.length !== 1) {
      console.warn(`  ${entry.file}: ${matches.length === 0 ? "no" : "more than one"} staff member matches ${entry.role ?? `"${entry.name}"`}; skipped. Add them in Dashboard → Team first.`);
      continue;
    }
    const target = matches[0];
    const original = await readFile(path.join(sourceDir, entry.file));
    const photo = await processPhoto(original, PHOTO_MAX_SIZE.team);
    const storagePath = `staff/${target.id}/${crypto.randomUUID()}.webp`;
    const upload = await supabase.storage
      .from("team")
      .upload(storagePath, photo.buffer, { contentType: "image/webp", cacheControl: "31536000", upsert: false });
    if (upload.error) throw new Error(`Upload failed for ${entry.file}: ${upload.error.message}`);
    const update = await supabase.from("staff").update({ photo_path: storagePath }).eq("id", target.id);
    if (update.error) {
      await supabase.storage.from("team").remove([storagePath]);
      throw new Error(`Couldn't save ${entry.file}: ${update.error.message}`);
    }
    if (target.photo_path) await supabase.storage.from("team").remove([target.photo_path]);
    console.log(`  ${entry.file} -> ${target.display_name} (${target.role}): ${Math.round(photo.bytes / 1024)} KB (${photo.width}x${photo.height})`);
  }
}

if (args.has("--team")) {
  console.log(`Importing team photos to ${new URL(url).host}${prod ? " (PRODUCTION)" : ""}`);
  await importTeam(selection.team ?? []);
  console.log("Done.");
  process.exit(0);
}

if (selection.slideshow.length > 3 || selection.recentCuts.length > 4) throw new Error("Too many photos: slideshow ≤ 3, recent cuts ≤ 4");

const { data: existing, error: listError } = await supabase.from("gallery_photos").select("id, path");
if (listError) throw listError;
const { data: settings } = await supabase.from("settings").select("shop_photo_path").eq("id", 1).single();

if (existing.length > 0 || settings?.shop_photo_path) {
  if (args.has("--if-empty")) {
    console.log("Website photos already present; nothing to do.");
    process.exit(0);
  }
  if (!args.has("--replace")) {
    console.error("The website already has photos. Run with --replace to remove them first.");
    process.exit(1);
  }
  const files = [...existing.map((p) => p.path), ...(settings?.shop_photo_path ? [settings.shop_photo_path] : [])];
  if (files.length) await supabase.storage.from("gallery").remove(files);
  await supabase.from("gallery_photos").delete().in("id", existing.map((p) => p.id));
  await supabase.from("settings").update({ shop_photo_path: null }).eq("id", 1);
  console.log(`Removed ${existing.length} photos${settings?.shop_photo_path ? " and the shop photo" : ""}.`);
}

async function upload(entry: Entry, folder: "photos" | "shop"): Promise<string> {
  const original = await readFile(path.join(sourceDir, entry.file));
  const photo = await processPhoto(original);
  const storagePath = `${folder}/${crypto.randomUUID()}.webp`;
  const { error } = await supabase.storage
    .from("gallery")
    .upload(storagePath, photo.buffer, { contentType: "image/webp", cacheControl: "31536000", upsert: false });
  if (error) throw new Error(`Upload failed for ${entry.file}: ${error.message}`);
  console.log(`  ${entry.file}: ${(original.length / 1024 / 1024).toFixed(1)} MB -> ${Math.round(photo.bytes / 1024)} KB (${photo.width}x${photo.height})`);
  return storagePath;
}

console.log(`Importing to ${new URL(url).host}${prod ? " (PRODUCTION)" : ""}`);

if (selection.shop) {
  const shopPath = await upload(selection.shop, "shop");
  const { error } = await supabase.from("settings").update({ shop_photo_path: shopPath }).eq("id", 1);
  if (error) throw error;
}

let sort = 10;
for (const [list, inHero] of [
  [selection.slideshow, true],
  [selection.recentCuts, false],
] as const) {
  for (const entry of list) {
    const storagePath = await upload(entry, "photos");
    const { error } = await supabase.from("gallery_photos").insert({ path: storagePath, alt: entry.alt, in_hero: inHero, visible: true, sort });
    if (error) throw new Error(`Couldn't save ${entry.file}: ${error.message}`);
    sort += 10;
  }
}
if (selection.team?.length) await importTeam(selection.team);
console.log("Done.");
