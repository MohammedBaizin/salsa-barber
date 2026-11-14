import { requireStaff } from "@/lib/auth/staff";
import { buildBackup } from "@/lib/backup/build";
import { backupCounts, MAX_BACKUP_BYTES, packBackup } from "@/lib/backup/format";
import { dateKey } from "@/lib/domain/time";
import { site } from "@/lib/site";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSessionClient } from "@/lib/supabase/server";

/**
 * GET /dashboard/backup/download (admin only): the whole booking system as a .zip (spec §8.11). Logged; Today
 * reminds admins when there hasn't been one for a week.
 */
export async function GET() {
  await requireStaff(["admin"]);
  const now = new Date();
  const backup = await buildBackup(createAdminClient(), site.name, now);
  const zip = packBackup(backup);
  const counts = backupCounts(backup);
  if (zip.length > MAX_BACKUP_BYTES) {
    // Vercel can't send responses over 4.5 MB. Unlikely for years; the local script has no limit.
    return new Response("The backup is too large to download from the dashboard. Use `npm run backup:prod` on a computer instead.", {
      status: 507,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  const supabase = await createSessionClient();
  await supabase.rpc("log_backup_event", {
    p_action: "backup.download",
    p_summary: `${counts.bookings} bookings, ${counts.clients} clients · ${Math.max(1, Math.round(zip.length / 1024))} KB`,
  });
  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="salsa-barber-backup-${dateKey(now)}.zip"`,
      "Content-Length": String(zip.length),
      "Cache-Control": "no-store",
    },
  });
}
