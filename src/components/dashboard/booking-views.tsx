"use client";

import { startTransition, useActionState, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarClock, Check, MessageCircle, MessageSquareText, Phone, RotateCcw, Scissors, UserRound, X } from "lucide-react";
import {
  changeBarber, changeService, changeStatus, createBooking, markMessageSent, rescheduleBooking,
} from "@/app/(staff)/dashboard/booking-actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { safely } from "@/lib/connection";
import { initialBookingActionState, type BookingActionState } from "@/lib/dashboard/action-state";
import { withDates, type DashboardBooking } from "@/lib/dashboard/types";
import { smsLink, whatsappLink } from "@/lib/domain/messages";
import { formatPence, penceToInput } from "@/lib/domain/money";
import { formatUkMobile } from "@/lib/domain/phone";
import { anywayLabel, type StaffTimeKind } from "@/lib/domain/schedule";
import { bookingMessage, DECLINE_REASON_MAX, planForBooking, type MessagePlan } from "@/lib/domain/staff-bookings";
import { addDays, dateKey, formatDayLong, formatMinutes, formatRelativeDay, formatTime, minuteOfDay } from "@/lib/domain/time";
import {
  availableActions, bookingName, REQUEST_FLAG_LABELS, SOURCE_LABELS, STATUS_LABELS, type BookingAction, type RequestFlag,
} from "@/lib/domain/today";
import { cn } from "@/lib/utils";
import { useBookings, type NewBookingDefaults, type NewKind } from "./bookings-provider";
import { ConfirmBar, Field, FormError, TimeSelect, Warnings } from "./form-parts";
import { SheetActions } from "./sheet";
import { FlagChip, StatusChip } from "./status-chip";

type ServerAction = (state: BookingActionState, formData: FormData) => Promise<BookingActionState>;

/** useActionState for a booking action; hands successes to the provider (message sheet or notice). */
function useBookingAction(action: ServerAction) {
  const { finish } = useBookings();
  const safe = useMemo(() => safely(action), [action]);
  const [state, formAction, pending] = useActionState(safe, initialBookingActionState);
  useEffect(() => {
    if (state.done) finish(state.done);
  }, [state.done, finish]);
  return { state, formAction, pending };
}

/**
 * Submits a form to its action WITHOUT React's automatic reset after `<form action>`: the reset snaps controlled
 * selects back to their first option while the screen still shows the chosen value. Values survive errors and
 * the "… anyway" step.
 */
function submitTo(action: (data: FormData) => void) {
  return (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const data = new FormData(event.currentTarget, submitter);
    startTransition(() => action(data));
  };
}

/**
 * Schedule warnings turn the submit button into "… anyway". Editing the form after a warning asks again.
 */
function useAnyway(state: BookingActionState) {
  const [editedAt, setEditedAt] = useState(-1);
  const armed = state.warnings.length > 0 && editedAt !== state.attempt;
  return { armed, edited: () => setEditedAt(state.attempt) };
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-3 py-2.5 sm:grid-cols-[7.5rem_1fr]">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 font-medium break-words">{children}</dd>
    </div>
  );
}

const ACTION_BUTTON = "justify-start";

// ---------------------------------------------------------------------------
// Details + every allowed action
// ---------------------------------------------------------------------------

export function BookingDetailsView({ booking, flags }: { booking: DashboardBooking; flags: RequestFlag[] }) {
  const { setup, today, show } = useBookings();
  const [now] = useState(() => new Date());
  const b = withDates(booking);
  const actions = availableActions({ ...b, hasPhone: Boolean(b.clientPhone) }, { staffId: setup.actor.staffId, role: setup.actor.role }, now);
  const has = (a: BookingAction) => actions.includes(a);
  const { state, formAction, pending } = useBookingAction(changeStatus);
  const [confirm, setConfirm] = useState<"cancel" | "no_show" | null>(null);
  const day = dateKey(b.startsAt);
  const relative = formatRelativeDay(day, today);

  const runStatus = (action: string) => {
    const data = new FormData();
    data.set("id", booking.id);
    data.set("action", action);
    startTransition(() => formAction(data));
  };
  const messagePlan = planForBooking(booking.status, booking.declineReason);

  return (
    <div className="space-y-4" data-testid="booking-details">
      <div className="flex flex-wrap gap-2">
        <StatusChip status={b.status} />
        {flags.map((f) => (
          <FlagChip key={f} tone={f === "expired" || f === "stale" ? "warning" : "neutral"}>
            {REQUEST_FLAG_LABELS[f]}
          </FlagChip>
        ))}
      </div>

      <dl className="divide-y">
        <Row label="When">
          {/^(Today|Tomorrow|Yesterday)$/.test(relative) ? `${relative}, ` : ""}
          {formatDayLong(day)}
          <br />
          {formatTime(b.startsAt)}–{formatTime(b.endsAt)} ({formatMinutes(b.durationMin)})
        </Row>
        <Row label="Service">
          {b.serviceName} · {formatPence(b.pricePence)}
        </Row>
        <Row label="Barber">
          {b.staffName}
          {b.anyBarber ? <span className="block text-sm font-normal text-muted-foreground">Customer chose any barber</span> : null}
        </Row>
        <Row label="Client">
          {b.clientName ?? bookingName(b)}
          {b.bookedName && b.clientName && b.bookedName !== b.clientName ? (
            <span className="block text-sm font-normal text-muted-foreground">Booked as {b.bookedName}</span>
          ) : null}
        </Row>
        {b.clientPhone ? <Row label="Mobile">{formatUkMobile(b.clientPhone)}</Row> : null}
        <Row label="Status">
          {STATUS_LABELS[b.status]}
          {b.cancelledByClient ? " by the customer" : ""}
        </Row>
        <Row label="Booked">{SOURCE_LABELS[b.source]}</Row>
        {b.declineReason ? <Row label="Reason">{b.declineReason}</Row> : null}
        {b.clientPhone && b.status !== "pending" ? (
          <Row label="Message">{b.messageSentAt ? "Sent to the customer" : "Not sent yet"}</Row>
        ) : null}
      </dl>

      <FormError>{state.error}</FormError>

      {confirm ? (
        <ConfirmBar
          question={confirm === "cancel" ? "Cancel this booking?" : "Mark as a no-show?"}
          confirmLabel={confirm === "cancel" ? "Cancel booking" : "Mark no-show"}
          pending={pending}
          onKeep={() => setConfirm(null)}
          onConfirm={() => runStatus(confirm)}
        />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2" data-testid="booking-actions">
          {has("accept") ? (
            <Button variant="pop" onClick={() => runStatus("accept")} disabled={pending} className="sm:col-span-2">
              <Check aria-hidden />
              Accept
            </Button>
          ) : null}
          {has("done") ? (
            <Button variant="pop" onClick={() => runStatus("done")} disabled={pending} className="sm:col-span-2">
              <Check aria-hidden />
              Done
            </Button>
          ) : null}
          {has("undo") ? (
            <Button variant="outline" onClick={() => runStatus("undo")} disabled={pending} className={ACTION_BUTTON}>
              <RotateCcw aria-hidden />
              Undo ({STATUS_LABELS[b.status]})
            </Button>
          ) : null}
          {has("message") && messagePlan ? (
            <Button variant="outline" className={ACTION_BUTTON} onClick={() => show({ kind: "message", booking, plan: messagePlan, notice: null })}>
              <MessageCircle aria-hidden />
              Message
            </Button>
          ) : null}
          {has("reschedule") ? (
            <Button variant="outline" className={ACTION_BUTTON} onClick={() => show({ kind: "reschedule", booking })}>
              <CalendarClock aria-hidden />
              Reschedule
            </Button>
          ) : null}
          {has("change_barber") ? (
            <Button variant="outline" className={ACTION_BUTTON} onClick={() => show({ kind: "barber", booking })}>
              <UserRound aria-hidden />
              Change barber
            </Button>
          ) : null}
          {has("change_service") ? (
            <Button variant="outline" className={ACTION_BUTTON} onClick={() => show({ kind: "service", booking })}>
              <Scissors aria-hidden />
              Change service or price
            </Button>
          ) : null}
          {has("no_show") ? (
            <Button variant="outline" className={ACTION_BUTTON} onClick={() => setConfirm("no_show")}>
              <X aria-hidden />
              No-show
            </Button>
          ) : null}
          {has("decline") ? (
            <Button variant="outline" className={cn(ACTION_BUTTON, "text-destructive")} onClick={() => show({ kind: "decline", booking })}>
              <X aria-hidden />
              Decline
            </Button>
          ) : null}
          {has("cancel") ? (
            <Button variant="outline" className={cn(ACTION_BUTTON, "text-destructive")} onClick={() => setConfirm("cancel")}>
              <X aria-hidden />
              Cancel booking
            </Button>
          ) : null}
          {b.clientPhone ? (
            <a href={`tel:${b.clientPhone}`} className={cn(buttonVariants({ variant: "outline" }), ACTION_BUTTON)}>
              <Phone aria-hidden />
              Call {formatUkMobile(b.clientPhone)}
            </a>
          ) : null}
        </div>
      )}
    </div>
  );
}

function BackButton({ booking }: { booking: DashboardBooking }) {
  const { show } = useBookings();
  return (
    <Button type="button" variant="outline" onClick={() => show({ kind: "details", booking, flags: [] })}>
      <ArrowLeft aria-hidden />
      Back
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Decline (optional reason, ≤ 200 characters, goes in the message)
// ---------------------------------------------------------------------------

export function DeclineView({ booking }: { booking: DashboardBooking }) {
  const { state, formAction, pending } = useBookingAction(changeStatus);
  const [reason, setReason] = useState("");
  return (
    <form onSubmit={submitTo(formAction)} className="space-y-4">
      <input type="hidden" name="id" value={booking.id} />
      <input type="hidden" name="action" value="decline" />
      <p className="text-muted-foreground">
        {booking.serviceName}, {formatRelativeDay(dateKey(new Date(booking.startsAt)), dateKey(new Date()))} at {formatTime(new Date(booking.startsAt))}.
      </p>
      <Field label="Reason (optional)" htmlFor="decline-reason" hint="Added to the message to the customer." error={state.fields.reason}>
        <textarea
          id="decline-reason"
          name="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={DECLINE_REASON_MAX}
          rows={3}
          aria-describedby="decline-reason-hint"
          className="w-full rounded-lg border border-input bg-card px-3.5 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          placeholder="e.g. We're fully booked that afternoon."
        />
      </Field>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {reason.length}/{DECLINE_REASON_MAX}
      </p>
      <FormError>{state.error}</FormError>
      <SheetActions>
        <BackButton booking={booking} />
        <Button type="submit" variant="destructive" disabled={pending}>
          {pending ? "Saving…" : "Decline request"}
        </Button>
      </SheetActions>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Date + time fields shared by reschedule and new bookings
// ---------------------------------------------------------------------------

function DateTimeFields({
  prefix,
  date,
  minute,
  onDate,
  onMinute,
  min,
  max,
  fields,
}: {
  prefix: string;
  date: string;
  minute: number;
  onDate: (v: string) => void;
  onMinute: (v: number) => void;
  min: string;
  max: string;
  fields: Record<string, string>;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-3">
      <Field label="Date" htmlFor={`${prefix}-date`} error={fields.date}>
        <Input
          id={`${prefix}-date`}
          name="date"
          type="date"
          required
          value={date}
          min={min}
          max={max}
          onChange={(e) => e.target.value && onDate(e.target.value)}
          aria-invalid={Boolean(fields.date) || undefined}
        />
      </Field>
      <Field label="Time" htmlFor={`${prefix}-time`} error={fields.minute}>
        <TimeSelect id={`${prefix}-time`} name="minute" value={minute} onChange={onMinute} invalid={Boolean(fields.minute)} />
      </Field>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reschedule
// ---------------------------------------------------------------------------

export function RescheduleView({ booking }: { booking: DashboardBooking }) {
  const { state, formAction, pending } = useBookingAction(rescheduleBooking);
  const { armed, edited } = useAnyway(state);
  const start = new Date(booking.startsAt);
  const [date, setDate] = useState(() => dateKey(start));
  const [minute, setMinute] = useState(() => minuteOfDay(start));
  const today = dateKey(new Date());

  return (
    <form onSubmit={submitTo(formAction)} onChange={edited} className="space-y-4">
      <input type="hidden" name="id" value={booking.id} />
      <input type="hidden" name="anyway" value={armed ? "1" : "0"} />
      <p className="text-muted-foreground">
        Now: {formatDayLong(start)}, {formatTime(start)} with {booking.staffName}.
      </p>
      <DateTimeFields
        prefix="reschedule"
        date={date}
        minute={minute}
        onDate={(v) => { setDate(v); edited(); }}
        onMinute={(v) => { setMinute(v); edited(); }}
        min={today}
        max={addDays(today, 365)}
        fields={state.fields}
      />
      {booking.status === "confirmed" && booking.clientPhone ? (
        <p className="text-sm text-muted-foreground">Afterwards you can send the customer the new time.</p>
      ) : null}
      {armed ? <Warnings warnings={state.warnings} /> : null}
      <FormError>{state.error}</FormError>
      <SheetActions>
        <BackButton booking={booking} />
        <Button type="submit" variant="pop" disabled={pending}>
          {pending ? "Saving…" : anywayLabel("reschedule", armed)}
        </Button>
      </SheetActions>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Change barber (owner/admin)
// ---------------------------------------------------------------------------

export function ChangeBarberView({ booking }: { booking: DashboardBooking }) {
  const { setup } = useBookings();
  const { state, formAction, pending } = useBookingAction(changeBarber);
  const { armed, edited } = useAnyway(state);
  const choices = setup.barbers.filter((b) => b.id !== booking.staffId);
  const [staffId, setStaffId] = useState(() => choices.find((b) => b.serviceIds.includes(booking.serviceId))?.id ?? choices[0]?.id ?? "");

  if (!choices.length) {
    return (
      <div className="space-y-4">
        <p>There&apos;s no other barber taking bookings.</p>
        <SheetActions>
          <BackButton booking={booking} />
        </SheetActions>
      </div>
    );
  }
  return (
    <form onSubmit={submitTo(formAction)} className="space-y-4">
      <input type="hidden" name="id" value={booking.id} />
      <input type="hidden" name="anyway" value={armed ? "1" : "0"} />
      <p className="text-muted-foreground">
        Now with {booking.staffName}, {formatDayLong(new Date(booking.startsAt))} at {formatTime(new Date(booking.startsAt))}.
      </p>
      <Field label="New barber" htmlFor="new-barber">
        <NativeSelect
          id="new-barber"
          name="staffId"
          value={staffId}
          onChange={(e) => {
            setStaffId(e.target.value);
            edited();
          }}
          className="w-full"
        >
          {choices.map((b) => (
            <NativeSelectOption key={b.id} value={b.id}>
              {b.name}
              {b.serviceIds.includes(booking.serviceId) ? "" : ` (doesn't do ${booking.serviceName})`}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      {armed ? <Warnings warnings={state.warnings} /> : null}
      <FormError>{state.error}</FormError>
      <SheetActions>
        <BackButton booking={booking} />
        <Button type="submit" variant="pop" disabled={pending}>
          {pending ? "Saving…" : armed ? "Save anyway" : "Save"}
        </Button>
      </SheetActions>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Change service or price (owner/admin; also once done)
// ---------------------------------------------------------------------------

export function ChangeServiceView({ booking }: { booking: DashboardBooking }) {
  const { setup } = useBookings();
  const { state, formAction, pending } = useBookingAction(changeService);
  const services = setup.services.some((s) => s.id === booking.serviceId)
    ? setup.services
    : [{ id: booking.serviceId, name: booking.serviceName, pricePence: booking.pricePence, durationMin: booking.durationMin, days: null }, ...setup.services];
  const [serviceId, setServiceId] = useState(booking.serviceId);
  const [price, setPrice] = useState(() => penceToInput(booking.pricePence));

  return (
    <form onSubmit={submitTo(formAction)} className="space-y-4">
      <input type="hidden" name="id" value={booking.id} />
      <Field label="Service" htmlFor="change-service">
        <NativeSelect
          id="change-service"
          name="serviceId"
          value={serviceId}
          onChange={(e) => {
            setServiceId(e.target.value);
            const s = services.find((x) => x.id === e.target.value);
            if (s) setPrice(penceToInput(s.pricePence));
          }}
          className="w-full"
        >
          {services.map((s) => (
            <NativeSelectOption key={s.id} value={s.id}>
              {s.name} · {formatPence(s.pricePence)} · {formatMinutes(s.durationMin)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Price (£)" htmlFor="change-price" error={state.fields.price}>
        <Input
          id="change-price"
          name="price"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          aria-invalid={Boolean(state.fields.price) || undefined}
          className="max-w-40"
        />
      </Field>
      <p className="text-sm text-muted-foreground">
        Only this booking changes. A different service also changes its length, and so its end time.
      </p>
      <FormError>{state.error}</FormError>
      <SheetActions>
        <BackButton booking={booking} />
        <Button type="submit" variant="pop" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </SheetActions>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Send to customer: WhatsApp | SMS (text built on demand, never stored)
// ---------------------------------------------------------------------------

export function MessageView({ booking, plan }: { booking: DashboardBooking; plan: MessagePlan }) {
  const { setup, close, notify } = useBookings();
  const phone = booking.clientPhone!;
  const text = bookingMessage(
    plan,
    {
      name: bookingName(booking),
      serviceName: booking.serviceName,
      barberName: booking.staffName,
      startsAt: new Date(booking.startsAt),
      pricePence: booking.pricePence,
      manageToken: booking.manageToken,
    },
    setup.shop,
  );
  const sent = () => {
    markMessageSent(booking.id).catch(() => {
      // Not recorded (offline): the message itself still goes. Nothing else depends on it.
    });
    close();
    notify("Marked as messaged.");
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        To {bookingName(booking)} · {formatUkMobile(phone)}
      </p>
      <p data-testid="message-preview" className="rounded-xl bg-muted p-3 text-sm whitespace-pre-wrap">
        {text}
      </p>
      <SheetActions>
        <a
          href={whatsappLink(phone, text)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={sent}
          className={cn(buttonVariants({ variant: "pop" }))}
        >
          <MessageCircle aria-hidden />
          WhatsApp
        </a>
        <a href={smsLink(phone, text)} onClick={sent} className={cn(buttonVariants({ variant: "outline" }))}>
          <MessageSquareText aria-hidden />
          SMS
        </a>
        <Button type="button" variant="ghost" onClick={close} className="basis-full">
          Not now
        </Button>
      </SheetActions>
    </div>
  );
}

// ---------------------------------------------------------------------------
// New walk-in or phone booking
// ---------------------------------------------------------------------------

/** "Now", rounded down to 5 minutes, for walk-ins added today; 10:00am otherwise. */
function defaultMinute(mode: NewKind, date: string): number {
  const now = new Date();
  if (mode === "walk_in" && date === dateKey(now)) return Math.floor(minuteOfDay(now) / 5) * 5;
  return 600;
}

export function NewBookingView({ mode, date: initialDate, defaults }: { mode: NewKind; date: string; defaults?: NewBookingDefaults }) {
  const { setup } = useBookings();
  const { state, formAction, pending } = useBookingAction(createBooking);
  const { armed, edited } = useAnyway(state);
  const manager = setup.actor.role !== "barber";
  const barbers = manager ? setup.barbers : setup.barbers.filter((b) => b.id === setup.actor.staffId);
  const today = dateKey(new Date());

  const [staffId, setStaffId] = useState(
    () =>
      barbers.find((b) => b.id === defaults?.staffId)?.id ?? barbers.find((b) => b.id === setup.actor.staffId)?.id ?? barbers[0]?.id ?? "",
  );
  const offered = setup.services.filter((s) => barbers.find((b) => b.id === staffId)?.serviceIds.includes(s.id));
  const services = offered.length ? offered : setup.services;
  const [serviceId, setServiceId] = useState(() => services.find((s) => s.id === defaults?.serviceId)?.id ?? services[0]?.id ?? "");
  const [date, setDate] = useState(() => {
    if (mode === "walk_in") return initialDate < addDays(today, -7) || initialDate > addDays(today, 1) ? today : initialDate;
    return initialDate < today ? today : initialDate;
  });
  const [minute, setMinute] = useState(() => defaults?.minute ?? defaultMinute(mode, date));
  const [name, setName] = useState(defaults?.name ?? "");
  const [phone, setPhone] = useState(defaults?.phone ?? "");
  const kind: StaffTimeKind = mode === "walk_in" ? "walk_in" : "phone";

  if (!barbers.length) {
    return <p>Your account isn&apos;t taking bookings, so it can&apos;t add {mode === "walk_in" ? "walk-ins" : "bookings"}.</p>;
  }
  const serviceValue = services.some((s) => s.id === serviceId) ? serviceId : (services[0]?.id ?? "");

  return (
    <form onSubmit={submitTo(formAction)} onChange={edited} className="space-y-4" data-testid="new-booking-form">
      <input type="hidden" name="kind" value={mode} />
      <input type="hidden" name="anyway" value={armed ? "1" : "0"} />
      {manager ? (
        <Field label="Barber" htmlFor="new-barber">
          <NativeSelect id="new-barber" name="staffId" value={staffId} onChange={(e) => setStaffId(e.target.value)} className="w-full">
            {barbers.map((b) => (
              <NativeSelectOption key={b.id} value={b.id}>
                {b.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      ) : (
        <input type="hidden" name="staffId" value={staffId} />
      )}
      <Field label="Service" htmlFor="new-service" error={state.fields.serviceId}>
        <NativeSelect id="new-service" name="serviceId" value={serviceValue} onChange={(e) => setServiceId(e.target.value)} className="w-full">
          {services.map((s) => (
            <NativeSelectOption key={s.id} value={s.id}>
              {s.name} · {formatPence(s.pricePence)} · {formatMinutes(s.durationMin)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <DateTimeFields
        prefix="new"
        date={date}
        minute={minute}
        onDate={setDate}
        onMinute={setMinute}
        min={mode === "walk_in" ? addDays(today, -7) : today}
        max={mode === "walk_in" ? addDays(today, 1) : addDays(today, 365)}
        fields={state.fields}
      />
      <Field label={mode === "walk_in" ? "Name (optional)" : "Name"} htmlFor="new-name" error={state.fields.name}>
        <Input
          id="new-name"
          name="name"
          autoComplete="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          aria-invalid={Boolean(state.fields.name) || undefined}
        />
      </Field>
      <Field
        label={mode === "walk_in" ? "Mobile (optional)" : "Mobile"}
        htmlFor="new-phone"
        hint={mode === "walk_in" ? "Add a name and mobile to keep them in Clients." : "Used to find or add the client."}
        error={state.fields.phone}
      >
        <Input
          id="new-phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          aria-describedby="new-phone-hint"
          aria-invalid={Boolean(state.fields.phone) || undefined}
        />
      </Field>
      {armed ? <Warnings warnings={state.warnings} /> : null}
      <FormError>{state.error}</FormError>
      <SheetActions>
        <Button type="submit" variant="pop" disabled={pending}>
          {pending ? "Saving…" : anywayLabel(kind, armed)}
        </Button>
      </SheetActions>
    </form>
  );
}
