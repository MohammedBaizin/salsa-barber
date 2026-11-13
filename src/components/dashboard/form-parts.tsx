"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { ScheduleWarning } from "@/lib/domain/schedule";
import { formatClock } from "@/lib/domain/time";
import { cn } from "@/lib/utils";

/**
 * "Are you sure?" bar for destructive actions (spec §8.1). Focus starts on Keep, so a stray Enter is harmless.
 */
export function ConfirmBar({
  question,
  confirmLabel,
  onConfirm,
  onKeep,
  pending,
}: {
  question: string;
  confirmLabel: string;
  onConfirm: () => void;
  onKeep: () => void;
  pending?: boolean;
}) {
  const keep = useRef<HTMLButtonElement>(null);
  useEffect(() => keep.current?.focus(), []);
  return (
    <div role="group" aria-label={question} className="rounded-xl border-2 border-destructive bg-card p-3">
      <p className="font-semibold">{question}</p>
      <div className="mt-3 flex flex-wrap gap-2 [&>*]:flex-1">
        <Button ref={keep} type="button" variant="outline" onClick={onKeep}>
          Keep
        </Button>
        <Button type="button" variant="destructive" onClick={onConfirm} disabled={pending}>
          {pending ? "Saving…" : confirmLabel}
        </Button>
      </div>
    </div>
  );
}

/** Schedule warnings before "… anyway" (never blocks). */
export function Warnings({ warnings }: { warnings: ScheduleWarning[] }) {
  if (!warnings.length) return null;
  return (
    <div role="alert" className="rounded-xl border-2 border-status-request-foreground bg-status-request p-3 text-status-request-foreground">
      <p className="flex items-center gap-2 font-semibold">
        <TriangleAlert aria-hidden className="size-5 shrink-0" />
        Please check
      </p>
      <ul className="mt-1 list-disc space-y-0.5 pl-9 text-sm">
        {warnings.map((w) => (
          <li key={w.code + w.message}>{w.message}</li>
        ))}
      </ul>
    </div>
  );
}

/** Form-level error (Playwright: formAlert()). */
export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-lg border border-destructive px-3 py-2 text-sm font-medium text-destructive">
      {children}
    </p>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p id={`${htmlFor}-hint`} className="text-sm text-muted-foreground">{hint}</p> : null}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Times on a 5-minute grid. A native select avoids iOS's overlapping time boxes. */
export const TIME_CHOICES = Array.from({ length: (22 - 6) * 12 + 1 }, (_, i) => 6 * 60 + i * 5);

export function TimeSelect({
  id,
  name,
  value,
  onChange,
  invalid,
}: {
  id: string;
  name: string;
  value: number;
  onChange: (minute: number) => void;
  invalid?: boolean;
}) {
  const choices = TIME_CHOICES.includes(value) ? TIME_CHOICES : [...TIME_CHOICES, value].sort((a, b) => a - b);
  return (
    <NativeSelect
      id={id}
      name={name}
      value={String(value)}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-invalid={invalid || undefined}
      className="w-full"
    >
      {choices.map((m) => (
        <NativeSelectOption key={m} value={m}>
          {formatClock(m)}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

const NOTICE_EVENT = "dashboard:notice";

/**
 * Shows a success notice in the dashboard's one toast (above the tab bar on phones, clears itself).
 * A plain function, so it works even when the component that asked has been replaced by a refresh.
 */
export function notify(text: string): void {
  window.dispatchEvent(new CustomEvent<string>(NOTICE_EVENT, { detail: text }));
}

/** The dashboard's toast (rendered once, in the layout). The latest notice wins. */
export function ToastHost() {
  const [message, setMessage] = useState<{ text: string; id: number } | null>(null);
  useEffect(() => {
    let id = 0;
    const show = (event: Event) => setMessage({ text: (event as CustomEvent<string>).detail, id: ++id });
    window.addEventListener(NOTICE_EVENT, show);
    return () => window.removeEventListener(NOTICE_EVENT, show);
  }, []);
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), 5000);
    return () => window.clearTimeout(timer);
  }, [message]);
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4 lg:bottom-6"
    >
      {message ? (
        <p key={message.id} data-testid="toast" className="rounded-full bg-secondary px-5 py-3 font-semibold text-secondary-foreground shadow-lg">
          {message.text}
        </p>
      ) : null}
    </div>
  );
}

/** true once this component has hydrated in the browser (false during the server render). */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}
