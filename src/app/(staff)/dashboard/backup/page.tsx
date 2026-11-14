import type { Metadata } from "next";
import { Suspense } from "react";
import { DownloadCard, RestoreCard, UndoCard } from "@/components/dashboard/backup-board";
import { LoadingLabel, Skeleton } from "@/components/dashboard/skeleton";
import { requireStaff } from "@/lib/auth/staff";
import { undoCreatedAt } from "@/lib/backup/restore";
import { createSessionClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Backup" };

async function Backup() {
  await requireStaff(["admin"]);
  const supabase = await createSessionClient();
  const [{ data: last }, undoAt] = await Promise.all([
    supabase.from("audit_log").select("at, actor_name").eq("action", "backup.download").order("id", { ascending: false }).limit(1).maybeSingle(),
    undoCreatedAt(),
  ]);
  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-h2 font-extrabold">Backup</h1>
        <p className="mt-1 text-muted-foreground">Admin only. Downloads, restores and undos appear in the activity log.</p>
      </div>
      <DownloadCard lastDownload={last ? { at: last.at, by: last.actor_name } : null} />
      <RestoreCard key={undoAt ?? "none"} />
      <UndoCard key={`undo-${undoAt ?? "none"}`} savedAt={undoAt} />
    </div>
  );
}

function BackupSkeleton() {
  return (
    <div className="max-w-2xl space-y-5">
      <LoadingLabel>Loading backup…</LoadingLabel>
      <Skeleton className="h-10 w-40" />
      <Skeleton className="h-56" />
      <Skeleton className="h-48" />
    </div>
  );
}

/** Built in phase 17. */
export default function BackupPage() {
  return (
    <Suspense fallback={<BackupSkeleton />}>
      <Backup />
    </Suspense>
  );
}
