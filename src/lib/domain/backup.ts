/** Backup reminder on Today for admins (spec §8.2, §8.11). */

export const BACKUP_REMINDER_DAYS = 7;

/** Null when a backup was downloaded within the last 7 days; otherwise the reminder text. */
export function backupReminder(lastDownload: Date | null, now: Date): string | null {
  if (!lastDownload) return "No backup has been downloaded recently. Download one and keep it somewhere safe.";
  const days = Math.floor((now.getTime() - lastDownload.getTime()) / 86_400_000);
  if (days < BACKUP_REMINDER_DAYS) return null;
  return `The last backup was downloaded ${days} days ago. Download a fresh one.`;
}
