"use client";

import { startTransition, useActionState, useOptimistic, useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Pencil, Plus, Trash2 } from "lucide-react";
import {
  deleteService, reorderServices, saveService, setServiceActive, type ServiceFormState,
} from "@/app/(staff)/dashboard/services/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { safely } from "@/lib/connection";
import { formatPence, penceToInput } from "@/lib/domain/money";
import { DURATION_CHOICES, formatDuration } from "@/lib/domain/services";
import { dayLongName, formatDays } from "@/lib/domain/time";
import { GENERIC_ERROR, OFFLINE_ERROR } from "@/lib/domain/validation";
import { cn } from "@/lib/utils";
import { ConfirmBar, Field, FormError, notify, useHydrated } from "./form-parts";
import { Sheet, SheetActions } from "./sheet";

export type ServiceRow = { id: string; name: string; pricePence: number; durationMin: number; active: boolean; days: number[] | null };

const initial: ServiceFormState = { error: null, fields: {}, done: null, attempt: 0 };

/** Service action that announces success as soon as it answers (the refresh may replace this form). */
function useServiceAction(action: (prev: ServiceFormState, data: FormData) => Promise<ServiceFormState>, onDone?: () => void) {
  const [run] = useState(() => {
    const safe = safely(action);
    return async (prev: ServiceFormState, data: FormData) => {
      const next = await safe(prev, data);
      if (next.done) {
        notify(next.done);
        onDone?.();
      }
      return next;
    };
  });
  return useActionState(run, initial);
}

function ServiceForm({ service, onClose }: { service: ServiceRow | null; onClose: () => void }) {
  const [state, dispatch, pending] = useServiceAction(saveService, onClose);
  const [toggleState, toggle, toggling] = useServiceAction(setServiceActive, onClose);
  const [deleteState, remove, deleting] = useServiceAction(deleteService, onClose);
  const [confirm, setConfirm] = useState(false);
  const ready = useHydrated();
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => dispatch(data));
  };
  const send = (run: (d: FormData) => void, fields: Record<string, string>) => {
    const data = new FormData();
    for (const [k, v] of Object.entries(fields)) data.set(k, v);
    startTransition(() => run(data));
  };
  const days = service?.days ?? [1, 2, 3, 4, 5, 6, 7];

  return (
    <form onSubmit={submit} className="space-y-4" data-ready={ready || undefined}>
      {service ? <input type="hidden" name="id" value={service.id} /> : null}
      <Field label="Name" htmlFor="svc-name" error={state.fields.name}>
        <Input id="svc-name" name="name" defaultValue={service?.name ?? ""} maxLength={80} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Price (£)" htmlFor="svc-price" error={state.fields.price}>
          <Input id="svc-price" name="price" inputMode="decimal" defaultValue={service ? penceToInput(service.pricePence) : ""} />
        </Field>
        <Field label="Length" htmlFor="svc-length" error={state.fields.durationMin}>
          <NativeSelect id="svc-length" name="durationMin" defaultValue={String(service?.durationMin ?? 30)} className="w-full">
            {DURATION_CHOICES.map((m) => (
              <NativeSelectOption key={m} value={m}>
                {formatDuration(m)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">Online booking days</legend>
        <div className="grid grid-cols-2 gap-x-3 sm:grid-cols-4">
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <label key={d} className="flex min-h-11 items-center gap-2">
              <input type="checkbox" name="days" value={d} defaultChecked={days.includes(d)} className="size-5 accent-foreground" />
              {dayLongName(d)}
            </label>
          ))}
        </div>
        {state.fields.days ? <p className="text-sm font-medium text-destructive">{state.fields.days}</p> : null}
        <p className="text-sm text-muted-foreground">e.g. OAP cuts only Monday to Thursday. Staff can still book any day.</p>
      </fieldset>
      {service ? (
        <p className="rounded-lg bg-muted p-3 text-sm">Bookings already made keep their own name, price and length.</p>
      ) : (
        <p className="rounded-lg bg-muted p-3 text-sm">Every barber who takes bookings will offer it; change that per person in Team.</p>
      )}
      <FormError>{state.error ?? toggleState.error ?? deleteState.error}</FormError>

      {service && !confirm ? (
        <div className="flex flex-wrap gap-2 border-t pt-4">
          <Button type="button" variant="outline" disabled={toggling} onClick={() => send(toggle, { id: service.id, active: service.active ? "0" : "1" })}>
            {service.active ? "Switch off" : "Switch on"}
          </Button>
          <Button type="button" variant="outline" className="text-destructive" onClick={() => setConfirm(true)}>
            <Trash2 aria-hidden />
            Delete
          </Button>
        </div>
      ) : null}
      {service && confirm ? (
        <ConfirmBar
          question={`Delete ${service.name}? Only possible if it was never booked.`}
          confirmLabel="Delete service"
          pending={deleting}
          onKeep={() => setConfirm(false)}
          onConfirm={() => send(remove, { id: service.id })}
        />
      ) : null}

      <SheetActions>
        <Button type="submit" variant="pop" disabled={pending}>
          {pending ? "Saving…" : service ? "Save" : "Add service"}
        </Button>
      </SheetActions>
    </form>
  );
}

/**
 * Services and prices. Owner/admin: add, edit, switch off/on, reorder (instant, rolled back with a message if it
 * can't be saved), delete if never booked. Barbers: read-only.
 */
export function ServicesBoard({ services, canEdit }: { services: ServiceRow[]; canEdit: boolean }) {
  const [order, setOrder] = useOptimistic(services);
  const [editing, setEditing] = useState<ServiceRow | "new" | null>(null);
  const [open, setOpen] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [round, setRound] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const edit = (s: ServiceRow | "new") => {
    setEditing(s);
    setRound((r) => r + 1);
    setOpen(true);
  };
  const move = (index: number, dir: -1 | 1) => {
    const next = [...order];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    setError(null);
    startTransition(async () => {
      setOrder(next);
      try {
        const r = await reorderServices(next.map((s) => s.id));
        if (r.error) setError(`Couldn't save the new order. ${r.error}`);
      } catch {
        setError(navigator.onLine === false ? OFFLINE_ERROR : GENERIC_ERROR);
      }
    });
  };

  return (
    <div className="space-y-4">
      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="pop" onClick={() => edit("new")}>
            <Plus aria-hidden />
            Add service
          </Button>
          <Button variant="outline" className="lg:hidden" aria-pressed={reordering} onClick={() => setReordering((r) => !r)}>
            <ArrowUpDown aria-hidden />
            {reordering ? "Done reordering" : "Reorder"}
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground">Prices and lengths are set by the owner.</p>
      )}
      {error ? (
        <p role="alert" className="rounded-lg border border-destructive px-3 py-2 text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}

      <ol className="divide-y overflow-hidden rounded-2xl border bg-card" data-testid="service-list">
        {order.map((s, i) => (
          <li key={s.id} className="flex items-center gap-3 px-3 py-3 sm:px-4" data-testid="service-row">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 font-semibold">
                {s.name}
                {s.active ? null : (
                  <span className="rounded-full bg-status-cancelled px-2 py-0.5 text-xs font-semibold text-status-cancelled-foreground">Switched off</span>
                )}
              </p>
              <p className="text-sm text-muted-foreground">
                <span className="price text-foreground">{formatPence(s.pricePence)}</span> · {formatDuration(s.durationMin)}
                {s.days ? ` · online ${formatDays(s.days)} only` : ""}
              </p>
            </div>
            {canEdit ? (
              <>
                <div className={cn("gap-1", reordering ? "flex" : "hidden lg:flex")}>
                  <Button variant="ghost" size="icon" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${s.name} up`}>
                    <ArrowUp aria-hidden />
                  </Button>
                  <Button variant="ghost" size="icon" disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${s.name} down`}>
                    <ArrowDown aria-hidden />
                  </Button>
                </div>
                <Button variant="outline" size="sm" onClick={() => edit(s)} aria-label={`Edit ${s.name}`}>
                  <Pencil aria-hidden />
                  Edit
                </Button>
              </>
            ) : null}
          </li>
        ))}
      </ol>

      {canEdit ? (
        <Sheet open={open} onClose={() => setOpen(false)} title={editing === "new" ? "Add a service" : "Edit service"} description={editing && editing !== "new" ? editing.name : undefined}>
          {open && editing ? <ServiceForm key={round} service={editing === "new" ? null : editing} onClose={() => setOpen(false)} /> : null}
        </Sheet>
      ) : null}
    </div>
  );
}
