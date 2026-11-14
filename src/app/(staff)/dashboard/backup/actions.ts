"use server";

import { refresh } from "next/cache";
import { requireStaff } from "@/lib/auth/staff";
import { backupCounts, BackupFileError, unpackBackup, type Backup } from "@/lib/backup/format";
import { dropSnapshot, dropUndo, keepSnapshotAsUndo, readUndo, restore, restoreErrorMessage, RestoreRefused, saveSnapshot } from "@/lib/backup/restore";
import { BACKED_UP, TABLE_LABELS } from "@/lib/backup/tables";
import { GENERIC_ERROR } from "@/lib/domain/validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSessionClient } from "@/lib/supabase/server";

/**
 * Restore and undo (spec §8.11), admin only. Preview first (backup date and counts next to today's), then the
 * admin types RESTORE (checked here, on the server). The current data is saved first as the undo.
 */

export type PreviewRow = { table: string; label: string; backup: number; live: number };
export type RestoreState = {
  error: string | null;
  preview: { createdAt: string; shop: string; rows: PreviewRow[] } | null;
  done: string | null;
  attempt: number;
};

const MAX_UPLOAD = 5 * 1024 * 1024;

async function readUpload(formData: FormData): Promise<Backup> {
  const file = formData.get("backup");
  if (!(file instanceof File) || file.size === 0) throw new BackupFileError("Please choose a backup .zip file.");
  if (file.size > MAX_UPLOAD) throw new BackupFileError("That file is too big to be a backup from this site.");
  return unpackBackup(new Uint8Array(await file.arrayBuffer()));
}

async function liveCounts(): Promise<Record<string, number>> {
  const db = createAdminClient();
  const entries = await Promise.all(
    BACKED_UP.map(async (t) => {
      const { count } = await db.from(t).select("*", { count: "exact", head: true });
      return [t, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(entries);
}

const answer = (prev: RestoreState, next: Partial<RestoreState>): RestoreState => ({ error: null, preview: null, done: null, ...next, attempt: prev.attempt + 1 });

export async function previewRestore(prev: RestoreState, formData: FormData): Promise<RestoreState> {
  await requireStaff(["admin"]);
  let backup: Backup;
  try {
    backup = await readUpload(formData);
  } catch (e) {
    return answer(prev, { error: e instanceof BackupFileError ? e.message : GENERIC_ERROR });
  }
  const counts = backupCounts(backup);
  const live = await liveCounts();
  return answer(prev, {
    preview: {
      createdAt: backup.createdAt,
      shop: backup.shop,
      rows: BACKED_UP.map((t) => ({ table: t, label: TABLE_LABELS[t], backup: counts[t], live: live[t] ?? 0 })),
    },
  });
}

async function logEvent(action: "backup.restore" | "backup.undo_restore", summary: string) {
  const supabase = await createSessionClient();
  await supabase.rpc("log_backup_event", { p_action: action, p_summary: summary });
}

export async function restoreBackup(prev: RestoreState, formData: FormData): Promise<RestoreState> {
  const staff = await requireStaff(["admin"]);
  if (String(formData.get("confirm") ?? "").trim() !== "RESTORE") {
    return answer(prev, { error: "Type RESTORE in capitals to confirm." });
  }
  let backup: Backup;
  try {
    backup = await readUpload(formData);
  } catch (e) {
    return answer(prev, { error: e instanceof BackupFileError ? e.message : GENERIC_ERROR });
  }

  let snapshot: string;
  try {
    snapshot = await saveSnapshot();
  } catch {
    return answer(prev, { error: "Couldn't save a copy of the current data first, so nothing was restored. Please try again." });
  }
  try {
    const result = await restore(backup, staff.userId);
    await keepSnapshotAsUndo(snapshot);
    const made = backup.createdAt.slice(0, 16).replace("T", " ");
    await logEvent("backup.restore", `Backup from ${made} UTC · ${result.counts.bookings ?? 0} bookings, ${result.counts.clients ?? 0} clients`);
    refresh();
    return answer(prev, {
      done: `Backup restored.${result.recreated ? ` ${result.recreated} deleted login${result.recreated === 1 ? " was" : "s were"} re-created with a new password: reset ${result.recreated === 1 ? "it" : "them"} in Team.` : ""}`,
    });
  } catch (e) {
    await dropSnapshot(snapshot);
    return answer(prev, { error: e instanceof RestoreRefused ? restoreErrorMessage(e.message) : "The restore didn't work. Nothing was changed." });
  }
}

/** Puts back the data from just before the last restore (once). */
export async function undoLastRestore(prev: RestoreState): Promise<RestoreState> {
  const staff = await requireStaff(["admin"]);
  const undo = await readUndo();
  if (!undo) return answer(prev, { error: "There's no restore to undo." });
  try {
    await restore(undo, staff.userId);
  } catch (e) {
    return answer(prev, { error: e instanceof RestoreRefused ? restoreErrorMessage(e.message) : "Undo didn't work. Nothing was changed." });
  }
  await dropUndo();
  await logEvent("backup.undo_restore", `Back to ${undo.createdAt.slice(0, 16).replace("T", " ")} UTC`);
  refresh();
  return answer(prev, { done: "The last restore was undone." });
}
