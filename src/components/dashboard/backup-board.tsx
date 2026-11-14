"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { Download, RotateCcw, Upload } from "lucide-react";
import { previewRestore, restoreBackup, undoLastRestore, type RestoreState } from "@/app/(staff)/dashboard/backup/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { safely } from "@/lib/connection";
import { formatDateTime } from "@/lib/domain/time";
import { cn } from "@/lib/utils";
import { Card, ConfirmBar, Field, FormError, notify } from "./form-parts";

const initial: RestoreState = { error: null, preview: null, done: null, attempt: 0 };
const previewSafely = safely(previewRestore);
const restoreSafely = safely(restoreBackup);
const undoSafely = safely(undoLastRestore);

export function DownloadCard({ lastDownload }: { lastDownload: { at: string; by: string } | null }) {
  return (
    <Card
      id="download"
      title="Download a backup"
      description="Everything in the booking system as one .zip: bookings, clients, team, services, settings, reviews, the activity log and the list of logins (no passwords). Photos stay in storage; the backup lists their names."
    >
      <p data-testid="last-download">
        {lastDownload ? (
          <>
            Last downloaded <strong>{formatDateTime(new Date(lastDownload.at))}</strong> by {lastDownload.by}.
          </>
        ) : (
          "No backup downloaded in the last 90 days."
        )}
      </p>
      {/* A plain link: the browser saves the file. */}
      <a href="/dashboard/backup/download" className={cn(buttonVariants({ variant: "pop" }))} download>
        <Download aria-hidden />
        Download backup
      </a>
      <p className="text-sm text-muted-foreground">
        Keep it somewhere safe and private (it has customers&apos; names and numbers). Download one at least once a week.
      </p>
    </Card>
  );
}

export function RestoreCard() {
  const [file, setFile] = useState<File | null>(null);
  const [confirm, setConfirm] = useState("");
  const [preview, runPreview, previewing] = useActionState(previewSafely, initial);
  const [result, runRestore, restoring] = useActionState(
    async (prev: RestoreState, data: FormData) => {
      const next = await restoreSafely(prev, data);
      if (next.done) notify(next.done);
      return next;
    },
    initial,
  );
  const send = (run: (d: FormData) => void, extra: Record<string, string> = {}) => {
    if (!file) return;
    const data = new FormData();
    data.set("backup", file);
    for (const [k, v] of Object.entries(extra)) data.set(k, v);
    startTransition(() => run(data));
  };
  const shown = preview.preview && preview.attempt > 0 ? preview.preview : null;

  return (
    <Card
      id="restore"
      title="Restore a backup"
      description="Replaces everything in the booking system with the backup. A copy of the current data is saved first, so you can undo it."
    >
      <div className="space-y-1.5">
        <label htmlFor="restore-file" className="text-sm font-medium">
          Backup file (.zip)
        </label>
        <input
          id="restore-file"
          type="file"
          accept=".zip,application/zip"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setConfirm("");
          }}
          className="block w-full max-w-80 text-sm file:mr-3 file:h-11 file:rounded-lg file:border-2 file:border-foreground file:bg-transparent file:px-4 file:font-semibold"
        />
      </div>
      <Button variant="outline" disabled={!file || previewing} onClick={() => send(runPreview)}>
        <Upload aria-hidden />
        {previewing ? "Checking…" : "Check this backup"}
      </Button>
      <FormError>{preview.error}</FormError>

      {shown && file ? (
        <div className="space-y-4" data-testid="restore-preview">
          <p>
            Backup of <strong>{shown.shop}</strong> made <strong>{formatDateTime(new Date(shown.createdAt))}</strong>.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Rows in the backup compared with now</caption>
              <thead>
                <tr className="border-b text-left">
                  <th scope="col" className="py-2 pr-3 font-semibold">What</th>
                  <th scope="col" className="py-2 pr-3 text-right font-semibold">In the backup</th>
                  <th scope="col" className="py-2 text-right font-semibold">Now</th>
                </tr>
              </thead>
              <tbody>
                {shown.rows.map((r) => (
                  <tr key={r.table} className="border-b last:border-0">
                    <th scope="row" className="py-1.5 pr-3 text-left font-normal">{r.label}</th>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{r.backup}</td>
                    <td className={cn("py-1.5 text-right tabular-nums", r.backup !== r.live && "font-semibold")}>{r.live}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form
            className="space-y-3 rounded-xl border-2 border-destructive p-4"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              send(runRestore, { confirm });
            }}
          >
            <p className="font-semibold">Everything changed since this backup will be replaced. Customers&apos; new bookings since then will be lost.</p>
            <Field label="Type RESTORE to confirm" htmlFor="restore-confirm" error={result.error ?? undefined}>
              <Input id="restore-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" autoCapitalize="characters" className="max-w-48 font-mono" />
            </Field>
            <Button type="submit" variant="destructive" disabled={restoring || confirm.trim() !== "RESTORE"}>
              {restoring ? "Restoring…" : "Restore this backup"}
            </Button>
          </form>
        </div>
      ) : null}
    </Card>
  );
}

export function UndoCard({ savedAt }: { savedAt: string | null }) {
  const [state, run, pending] = useActionState(
    async (prev: RestoreState) => {
      const next = await undoSafely(prev);
      if (next.done) notify(next.done);
      return next;
    },
    initial,
  );
  const [asking, setAsking] = useState(false);
  if (!savedAt) return null;
  return (
    <Card id="undo" title="Undo the last restore" description={`Puts back the data as it was just before the last restore (saved ${formatDateTime(new Date(savedAt))}). Works once.`}>
      {asking ? (
        <ConfirmBar
          question="Undo the last restore? Anything changed since the restore is replaced too."
          confirmLabel="Undo restore"
          pending={pending}
          onKeep={() => setAsking(false)}
          onConfirm={() => startTransition(() => run())}
        />
      ) : (
        <Button variant="outline" onClick={() => setAsking(true)}>
          <RotateCcw aria-hidden />
          Undo last restore
        </Button>
      )}
      <FormError>{state.error}</FormError>
    </Card>
  );
}
