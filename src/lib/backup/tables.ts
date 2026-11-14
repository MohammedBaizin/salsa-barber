import type { Database } from "@/lib/supabase/database.types";

/**
 * Every public table must be listed: adding a table to the database makes this fail to compile until someone
 * decides whether it's backed up or deliberately left out (spec §8.11).
 * The order is the restore order (parents first); restore_backup() in SQL uses the same list.
 */
type TableName = keyof Database["public"]["Tables"];

export const BACKUP_TABLES = {
  settings: "backup",
  services: "backup",
  staff: "backup",
  staff_services: "backup",
  time_off: "backup",
  closures: "backup",
  clients: "backup",
  bookings: "backup",
  gallery_photos: "backup",
  reviews: "backup",
  audit_log: "backup",
  // Short-lived security data and per-device keys: never backed up.
  request_attempts: "skip",
  login_failures: "skip",
  push_subscriptions: "skip",
} as const satisfies Record<TableName, "backup" | "skip">;

type Listed = keyof typeof BACKUP_TABLES;
export type BackedUpTable = { [K in Listed]: (typeof BACKUP_TABLES)[K] extends "backup" ? K : never }[Listed];

export const BACKED_UP = (Object.keys(BACKUP_TABLES) as Listed[]).filter((t): t is BackedUpTable => BACKUP_TABLES[t] === "backup");

export const TABLE_LABELS: Record<BackedUpTable, string> = {
  settings: "Settings",
  services: "Services",
  staff: "Team",
  staff_services: "Who does which service",
  time_off: "Time off",
  closures: "Closed days",
  clients: "Clients",
  bookings: "Bookings",
  gallery_photos: "Website photos",
  reviews: "Reviews",
  audit_log: "Activity log",
};
