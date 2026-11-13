"use client";

import { startTransition, useActionState, useEffect, useRef, useState, useSyncExternalStore, type ComponentProps, type FormEvent, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { safely } from "@/lib/connection";
import { initialSaveState, type SaveState } from "@/lib/dashboard/action-state";
import type { ScheduleWarning } from "@/lib/domain/schedule";
import { hoursFormValues, type WeeklyHours } from "@/lib/domain/hours";
import { dayLongName, formatClock } from "@/lib/domain/time";
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

// ---------------------------------------------------------------------------
// Save forms (Team, Settings): useSave + Form + Card + SaveButton
// ---------------------------------------------------------------------------

/**
 * A save action with useActionState, submitted without React's form reset (values survive errors).
 * The success notice is sent as soon as the action answers, even if the refresh that follows replaces this form.
 * A one-time password in the answer is shown by the form instead of a notice. `onDone` runs after a success
 * (e.g. to close a sheet).
 */
export function useSave(action: (prev: SaveState, data: FormData) => Promise<SaveState>, onDone?: (next: SaveState) => void) {
  const latestOnDone = useRef(onDone);
  useEffect(() => {
    latestOnDone.current = onDone;
  });
  const [run] = useState(() => {
    const safe = safely(action);
    return async (prev: SaveState, data: FormData) => {
      const next = await safe(prev, data);
      if (next.done) {
        if (!next.done.password) notify(next.done.notice);
        latestOnDone.current?.(next);
      }
      return next;
    };
  });
  const [state, dispatch, pending] = useActionState(run, initialSaveState);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
    startTransition(() => dispatch(data));
  };
  const send = (data: FormData) => startTransition(() => dispatch(data));
  return { state, submit, send, pending };
}

/** <form> that says when it's interactive (data-ready), so automated tests don't type before hydration. */
export function Form(props: ComponentProps<"form">) {
  const ready = useHydrated();
  return <form {...props} data-ready={ready || undefined} />;
}

export function Card({ id, title, description, children }: { id?: string; title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 space-y-4 rounded-2xl border bg-card p-4 sm:p-6" aria-label={title}>
      <div>
        <h2 className="text-h3 font-bold">{title}</h2>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function SaveButton({ pending, children = "Save" }: { pending: boolean; children?: string }) {
  return (
    <Button type="submit" variant="pop" disabled={pending}>
      {pending ? "Saving…" : children}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Weekly hours editor (Team schedules and Settings → Opening hours)
// ---------------------------------------------------------------------------

export function WeeklyHoursFields({
  legend,
  offLabel,
  hours,
  errors,
  readOnly,
}: {
  legend: string;
  offLabel: string;
  hours: WeeklyHours;
  errors: Record<string, string>;
  readOnly: boolean;
}) {
  const [rows, setRows] = useState(() => hoursFormValues(hours));
  const update = (i: number, patch: Partial<(typeof rows)[number]>) => setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  return (
    <fieldset disabled={readOnly} className="divide-y">
      <legend className="sr-only">{legend}</legend>
      {rows.map((row, i) => {
        const day = dayLongName(Number(row.day));
        const error = errors[`day_${row.day}`];
        return (
          <div key={row.day} className="grid grid-cols-1 items-center gap-x-3 gap-y-1 py-2.5 sm:grid-cols-[minmax(0,8rem)_minmax(0,1fr)]" data-testid={`hours-${row.day}`}>
            <label className="flex min-h-11 items-center gap-2 font-medium">
              <input
                type="checkbox"
                name={`day_${row.day}_on`}
                checked={row.on}
                onChange={(e) => update(i, { on: e.target.checked })}
                className="size-5 accent-foreground"
              />
              {day}
            </label>
            {row.on ? (
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                <TimeSelect id={`day-${row.day}-open`} name={`day_${row.day}_open`} value={row.open} onChange={(v) => update(i, { open: v })} invalid={Boolean(error)} />
                <span aria-hidden>–</span>
                <TimeSelect id={`day-${row.day}-close`} name={`day_${row.day}_close`} value={row.close} onChange={(v) => update(i, { close: v })} invalid={Boolean(error)} />
                <span className="sr-only">
                  <label htmlFor={`day-${row.day}-open`}>{day} start</label>
                  <label htmlFor={`day-${row.day}-close`}>{day} finish</label>
                </span>
              </div>
            ) : (
              <span className="text-muted-foreground">{offLabel}</span>
            )}
            {error ? (
              <p role="alert" className="text-sm font-medium text-destructive sm:col-span-2">
                {day}: {error}
              </p>
            ) : null}
          </div>
        );
      })}
    </fieldset>
  );
}

