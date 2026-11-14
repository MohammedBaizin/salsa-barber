import "server-only";
import { tempPassword } from "@/lib/auth/temp-password";
import { site } from "@/lib/site";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { buildBackup } from "./build";
import { packBackup, unpackBackup, type Backup } from "./format";

/**
 * Restoring (spec §8.11), with the secret key. Before a restore, the current data is saved as an "undo snapshot"
 * in the private restore-snapshots bucket; it's only kept as the undo once the restore has worked.
 */

const BUCKET = "restore-snapshots";
const UNDO = "undo/latest.zip";

/** Readable messages for restore_backup()'s refusals. */
export function restoreErrorMessage(message: string | undefined): string {
  if (message?.startsWith("backup_mismatch")) {
    return "This backup doesn't match the current database (it's from a different version or was changed). Nothing was restored.";
  }
  return "The restore didn't work. Nothing was changed.";
}

/** Saves the current data as a pending snapshot; returns its path. */
export async function saveSnapshot(): Promise<string> {
  const db = createAdminClient();
  const zip = packBackup(await buildBackup(db, site.name));
  const path = `pending/${Date.now()}-${crypto.randomUUID()}.zip`;
  const { error } = await db.storage.from(BUCKET).upload(path, zip, { contentType: "application/zip", upsert: false });
  if (error) throw new Error(`Couldn't save the undo snapshot: ${error.message}`);
  return path;
}

/** The restore worked: the pending snapshot becomes the undo. */
export async function keepSnapshotAsUndo(pending: string): Promise<void> {
  const db = createAdminClient();
  await db.storage.from(BUCKET).remove([UNDO]);
  const { error } = await db.storage.from(BUCKET).move(pending, UNDO);
  if (error) throw new Error(`Couldn't keep the undo snapshot: ${error.message}`);
}

export async function dropSnapshot(path: string): Promise<void> {
  await createAdminClient().storage.from(BUCKET).remove([path]);
}

/** The last undo snapshot, if there is one. */
export async function readUndo(): Promise<Backup | null> {
  const { data, error } = await createAdminClient().storage.from(BUCKET).download(UNDO);
  if (error || !data) return null;
  try {
    return unpackBackup(new Uint8Array(await data.arrayBuffer()));
  } catch {
    return null;
  }
}

export async function undoCreatedAt(): Promise<string | null> {
  const { data } = await createAdminClient().storage.from(BUCKET).list("undo", { limit: 10 });
  const file = data?.find((f) => f.name === "latest.zip");
  return file?.created_at ?? file?.updated_at ?? null;
}

export async function dropUndo(): Promise<void> {
  await createAdminClient().storage.from(BUCKET).remove([UNDO]);
}

/**
 * Puts a backup back: logins deleted since are re-created first (same id and username, a new random password the
 * admin resets from Team), then restore_backup() swaps the data in one transaction.
 */
export async function restore(backup: Backup, adminUserId: string): Promise<{ counts: Record<string, number>; recreated: number }> {
  const db = createAdminClient();
  const existing = new Set<string>();
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Couldn't read logins: ${error.message}`);
    for (const u of data.users) existing.add(u.id);
    if (data.users.length < 1000) break;
  }
  let recreated = 0;
  for (const login of backup.logins) {
    if (existing.has(login.id) || !login.email) continue;
    const { error } = await db.auth.admin.createUser({ id: login.id, email: login.email, password: tempPassword(24), email_confirm: true });
    if (!error) recreated += 1;
  }
  const { data, error } = await db.rpc("restore_backup", { p_tables: backup.tables as unknown as Json, p_admin_user: adminUserId });
  if (error) throw new RestoreRefused(error.message);
  return { counts: data as Record<string, number>, recreated };
}

export class RestoreRefused extends Error {}
