/**
 * Builds a backup from the database with the secret key. No "server-only" import, so the local backup script can
 * use it; only ever called by server code or that script.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { BACKUP_FORMAT, BACKUP_VERSION, type Backup, type BackupLogin } from "./format.ts";
import { BACKED_UP, type BackedUpTable } from "./tables.ts";

const PAGE = 1000;

/** A stable order so paging never skips or repeats a row. */
const ORDER: Record<BackedUpTable, string[]> = {
  settings: ["id"],
  services: ["id"],
  staff: ["id"],
  staff_services: ["staff_id", "service_id"],
  time_off: ["id"],
  closures: ["id"],
  clients: ["id"],
  bookings: ["id"],
  gallery_photos: ["id"],
  reviews: ["id"],
  audit_log: ["id"],
};

async function allRows(db: SupabaseClient<Database>, table: BackedUpTable): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = db.from(table).select("*").range(from, from + PAGE - 1);
    for (const column of ORDER[table]) q = q.order(column);
    const { data, error } = await q;
    if (error) throw new Error(`Couldn't read ${table}: ${error.message}`);
    rows.push(...(data as Record<string, unknown>[]));
    if (!data || data.length < PAGE) return rows;
  }
}

async function allLogins(db: SupabaseClient<Database>): Promise<BackupLogin[]> {
  const out: BackupLogin[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Couldn't read logins: ${error.message}`);
    out.push(...data.users.map((u) => ({ id: u.id, email: u.email ?? "", created_at: u.created_at })));
    if (data.users.length < 1000) return out;
  }
}

async function fileNames(db: SupabaseClient<Database>, bucket: string): Promise<string[]> {
  const names: string[] = [];
  const walk = async (prefix: string): Promise<void> => {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await db.storage.from(bucket).list(prefix, { limit: 1000, offset });
      if (error) throw new Error(`Couldn't list ${bucket}: ${error.message}`);
      for (const item of data) {
        const path = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.id) names.push(path);
        else await walk(path); // a folder
      }
      if (data.length < 1000) return;
    }
  };
  await walk("");
  return names.sort();
}

export async function buildBackup(db: SupabaseClient<Database>, shop: string, now: Date = new Date()): Promise<Backup> {
  const tables = {} as Backup["tables"];
  for (const t of BACKED_UP) tables[t] = await allRows(db, t);
  const [logins, gallery, team] = await Promise.all([allLogins(db), fileNames(db, "gallery"), fileNames(db, "team")]);
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: now.toISOString(), shop, tables, logins, photos: { gallery, team } };
}
