#!/usr/bin/env node
/**
 * Local backup copy (spec §8.11, optional): the database rows, the list of logins (no passwords) and every photo
 * file, into a dated folder under BACKUP_DIR. Keeps the newest 8 folders. Read-only for the live site.
 *
 *   npm run backup:prod        production (.env.production.local)
 *   npm run backup:local       this machine's Supabase (.env.local), e.g. to try it
 *
 * Keep the folder private: it holds customers' names and phone numbers.
 */
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { buildBackup } from "../src/lib/backup/build.ts";
import { backupCounts, packBackup } from "../src/lib/backup/format.ts";

const KEEP = 8;
const prod = process.argv.includes("--prod");
const envFile = prod ? ".env.production.local" : ".env.local";
function fail(message: string): never {
  console.error(`\n${message}\n`);
  process.exit(1);
}
try {
  process.loadEnvFile(envFile);
} catch {
  fail(`Couldn't read ${envFile}.`);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const root = process.env.BACKUP_DIR;
if (!url || !secret) fail(`${envFile} needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.`);
if (!root) fail(`Set BACKUP_DIR in ${envFile} to the folder where backups should go (somewhere private, not inside this project).`);

const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
console.log(`Backing up ${new URL(url).host}${prod ? " (PRODUCTION, read-only)" : ""}`);

const now = new Date();
const stamp = now.toISOString().slice(0, 16).replace(/[:T]/g, "-");
const dir = path.join(root, `salsa-barber-${stamp}`);
await mkdir(dir, { recursive: true });

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the script's client isn't typed with the schema
const backup = await buildBackup(db as any, "Salsa Barber", now);
await writeFile(path.join(dir, "backup.zip"), packBackup(backup));

let photos = 0;
for (const bucket of ["gallery", "team"] as const) {
  for (const name of backup.photos[bucket]) {
    const { data, error } = await db.storage.from(bucket).download(name);
    if (error || !data) {
      console.warn(`  couldn't download ${bucket}/${name}`);
      continue;
    }
    const file = path.join(dir, "photos", bucket, ...name.split("/"));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, Buffer.from(await data.arrayBuffer()));
    photos += 1;
  }
}

// Keep the newest KEEP backups.
const folders = (await readdir(root, { withFileTypes: true }))
  .filter((d) => d.isDirectory() && d.name.startsWith("salsa-barber-"))
  .map((d) => d.name)
  .sort()
  .reverse();
for (const old of folders.slice(KEEP)) await rm(path.join(root, old), { recursive: true, force: true });

const counts = backupCounts(backup);
console.log(`\nSaved to ${dir}\n  ${counts.bookings} bookings, ${counts.clients} clients, ${backup.logins.length} logins, ${photos} photos\n  Kept the newest ${KEEP} backups.\n`);
