"use client";

import { useEffect, useState, type DragEvent, type FormEvent } from "react";
import { ImageUp } from "lucide-react";
import { GENERIC_ERROR } from "@/lib/domain/validation";
import { formatBytes, PHOTO_ACCEPT, shrinkPhoto } from "@/lib/images/shrink";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Choosing a photo (Website and Team): drop zone, file picker, browser-side shrinking (HEIC too), instant preview
// ---------------------------------------------------------------------------

export type Picked = { file: File; url: string; note: string };

export function usePhotoPick() {
  const [picked, setPicked] = useState<Picked | null>(null);
  const [optimising, setOptimising] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => () => (picked ? URL.revokeObjectURL(picked.url) : undefined), [picked]);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setOptimising(true);
    setError(null);
    try {
      const r = await shrinkPhoto(file);
      setPicked({
        file: r.file,
        url: URL.createObjectURL(r.file),
        note: r.changed ? `${formatBytes(r.before)} → ${formatBytes(r.after)}` : formatBytes(r.after),
      });
    } catch (e) {
      setPicked(null);
      setError(e instanceof Error ? e.message : GENERIC_ERROR);
    } finally {
      setOptimising(false);
    }
  };
  return { picked, optimising, error, pick, clear: () => setPicked(null) };
}

export function PhotoDrop({
  id,
  label,
  pick,
  error,
}: {
  id: string;
  label: string;
  pick: ReturnType<typeof usePhotoPick>;
  error?: string;
}) {
  const [over, setOver] = useState(false);
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setOver(false);
    void pick.pick(e.dataTransfer.files[0]);
  };
  const shown = pick.error ?? error;
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={cn("flex flex-wrap items-center gap-4 rounded-xl border-2 border-dashed p-3", over ? "border-foreground bg-muted" : "border-input")}
      data-testid="photo-drop"
    >
      {pick.picked ? (
        // eslint-disable-next-line @next/next/no-img-element -- local preview (blob:)
        <img src={pick.picked.url} alt="Preview of the chosen photo" className="size-24 rounded-lg border object-cover" data-testid="photo-preview" />
      ) : (
        <div aria-hidden className="flex size-24 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <ImageUp className="size-8" />
        </div>
      )}
      <div className="min-w-0 flex-1 space-y-1.5">
        <label htmlFor={id} className="block text-sm font-medium">
          {label}
        </label>
        <input
          id={id}
          type="file"
          accept={PHOTO_ACCEPT}
          onChange={(e) => void pick.pick(e.target.files?.[0])}
          aria-invalid={shown ? true : undefined}
          aria-describedby={`${id}-status`}
          className="w-full max-w-72 text-sm file:mr-3 file:h-11 file:rounded-lg file:border-2 file:border-foreground file:bg-transparent file:px-4 file:font-semibold"
        />
        <p id={`${id}-status`} className={cn("text-sm", shown ? "font-medium text-destructive" : "text-muted-foreground")} aria-live="polite">
          {pick.optimising ? "Optimising…" : shown ? shown : pick.picked ? `Ready: ${pick.picked.note}` : "Or drop a photo here. iPhone photos are fine."}
        </p>
      </div>
    </div>
  );
}

/** FormData from the form, with the shrunk photo instead of the picker's original file. */
export function formWithPhoto(event: FormEvent<HTMLFormElement>, picked: Picked | null): FormData {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  if (picked) data.set("photo", picked.file);
  return data;
}

