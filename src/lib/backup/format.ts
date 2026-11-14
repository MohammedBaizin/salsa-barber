/**
 * The backup file: a zip with backup.json and README.txt. Pure (no database), shared by the dashboard, the
 * local backup script and the tests.
 */
import { BACKED_UP, type BackedUpTable } from "./tables.ts";
import { BadZipError, createZip, readZip } from "./zip.ts";

export const BACKUP_FORMAT = "salsa-barber-backup";
export const BACKUP_VERSION = 1;
/** Vercel's response/request limit is 4.5 MB; keep well under it. */
export const MAX_BACKUP_BYTES = 4 * 1024 * 1024;

export type BackupLogin = { id: string; email: string; created_at: string };

export type Backup = {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: string;
  shop: string;
  tables: Record<BackedUpTable, Record<string, unknown>[]>;
  /** Logins (no password hashes, no two-step secrets). */
  logins: BackupLogin[];
  /** Photo file names in storage (the files themselves aren't in the zip). */
  photos: { gallery: string[]; team: string[] };
};

export function backupCounts(b: Pick<Backup, "tables">): Record<BackedUpTable, number> {
  return Object.fromEntries(BACKED_UP.map((t) => [t, b.tables[t]?.length ?? 0])) as Record<BackedUpTable, number>;
}

function readme(b: Backup): string {
  const counts = backupCounts(b);
  return [
    `${b.shop} backup`,
    `Made: ${b.createdAt} (UTC)`,
    "",
    "backup.json holds every table of the booking system (except short-lived security data), the list of staff",
    "logins (without passwords) and the names of the photo files. The photos themselves stay in storage.",
    "",
    "To restore it: Dashboard, More, Backup, Restore (admin only). Keep this file somewhere safe and private:",
    "it contains customers' names and phone numbers.",
    "",
    ...Object.entries(counts).map(([t, n]) => `${t}: ${n}`),
    "",
  ].join("\n");
}

export function packBackup(b: Backup): Buffer {
  return createZip(
    [
      { name: "backup.json", data: JSON.stringify(b) },
      { name: "README.txt", data: readme(b) },
    ],
    new Date(b.createdAt),
  );
}

export class BackupFileError extends Error {}

/** Reads and checks a backup zip. Throws BackupFileError with a readable message. */
export function unpackBackup(zip: Uint8Array): Backup {
  let files: Map<string, Buffer>;
  try {
    files = readZip(zip);
  } catch (e) {
    throw new BackupFileError(e instanceof BadZipError ? "That file isn't a backup zip we can read." : "That file couldn't be opened.");
  }
  const json = files.get("backup.json");
  if (!json) throw new BackupFileError("That zip doesn't contain a backup (backup.json is missing).");
  let b: Backup;
  try {
    b = JSON.parse(json.toString("utf8"));
  } catch {
    throw new BackupFileError("The backup inside the zip is damaged.");
  }
  if (b?.format !== BACKUP_FORMAT) throw new BackupFileError("That isn't a backup from this booking system.");
  if (b.version !== BACKUP_VERSION) throw new BackupFileError("That backup was made by a different version and can't be restored here.");
  if (typeof b.createdAt !== "string" || Number.isNaN(Date.parse(b.createdAt))) throw new BackupFileError("The backup's date is missing.");
  for (const t of BACKED_UP) {
    if (!Array.isArray(b.tables?.[t])) throw new BackupFileError(`The backup is missing the ${t} table.`);
  }
  if (!Array.isArray(b.logins)) throw new BackupFileError("The backup's login list is missing.");
  return b;
}
