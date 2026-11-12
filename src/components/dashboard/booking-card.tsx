"use client";

import { useState, useTransition } from "react";
import { Check, Phone, UserPlus } from "lucide-react";
import { changeStatus } from "@/app/(staff)/dashboard/booking-actions";
import { Button } from "@/components/ui/button";
import { safely } from "@/lib/connection";
import { initialBookingActionState } from "@/lib/dashboard/action-state";
import { withDates, type DashboardBooking } from "@/lib/dashboard/types";
import { formatPence } from "@/lib/domain/money";
import { dateKey, formatRelativeDay, formatTime } from "@/lib/domain/time";
import { bookingName, primaryAction, REQUEST_FLAG_LABELS, type RequestFlag } from "@/lib/domain/today";
import { cn } from "@/lib/utils";
import { useBookings, type NewKind } from "./bookings-provider";
import { FlagChip, STATUS_STYLES, StatusChip } from "./status-chip";

const safeChangeStatus = safely(changeStatus);

/**
 * Accept (requests) or Done (once started), right on the card.
 * Calls the action directly and hands the result to the provider: the refresh that follows moves the booking to
 * another list, so this card may be gone by the time the answer arrives.
 */
function PrimaryButton({ booking, action }: { booking: DashboardBooking; action: "accept" | "done" }) {
  const { finish } = useBookings();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const name = bookingName(booking);
  return (
    <div className="relative z-10 mt-3 space-y-2">
      <Button
        variant={action === "accept" ? "pop" : "ink"}
        size="sm"
        disabled={pending}
        aria-label={`${action === "accept" ? "Accept" : "Done"}: ${name}, ${formatTime(new Date(booking.startsAt))}`}
        onClick={() => {
          const data = new FormData();
          data.set("id", booking.id);
          data.set("action", action);
          setError(null);
          startTransition(async () => {
            const result = await safeChangeStatus(initialBookingActionState, data);
            if (result.done) finish(result.done);
            else setError(result.error);
          });
        }}
      >
        <Check aria-hidden />
        {pending ? "Saving…" : action === "accept" ? "Accept" : "Done"}
      </Button>
      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Booking card: coloured left edge + status word, time, client, service · price · barber, chips, and one primary
 * action. The rest of the card opens the details sheet (every allowed action).
 */
export function BookingCard({
  booking,
  today,
  now,
  flags = [],
  showDay = false,
  showBarber = true,
  note,
}: {
  booking: DashboardBooking;
  today: string;
  /** Server time of this render (keeps the server and browser render identical). */
  now: string;
  flags?: RequestFlag[];
  /** Show "Tomorrow" / "Fri 9 Oct" before the time (lists that span days). */
  showDay?: boolean;
  showBarber?: boolean;
  /** Extra chip, e.g. "in 25 min". */
  note?: string | null;
}) {
  const { show, setup } = useBookings();
  const b = withDates(booking);
  const when = showDay ? `${formatRelativeDay(dateKey(b.startsAt), today)}, ${formatTime(b.startsAt)}` : formatTime(b.startsAt);
  const name = bookingName(b);
  const primary = primaryAction({ ...b, hasPhone: Boolean(b.clientPhone) }, { staffId: setup.actor.staffId, role: setup.actor.role }, new Date(now));

  return (
    <div
      data-testid="booking-card"
      data-status={b.status}
      className={cn(
        "relative rounded-xl border border-l-4 bg-card p-3 transition-colors has-[>button:first-child:hover]:bg-muted/60 sm:p-4",
        STATUS_STYLES[b.status].edge,
        flags.includes("stale") && "ring-2 ring-status-request-foreground/60",
      )}
    >
      <button
        type="button"
        onClick={() => show({ kind: "details", booking, flags })}
        aria-haspopup="dialog"
        className="block w-full text-left after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:outline-none focus-visible:after:outline-3 focus-visible:after:outline-ring"
      >
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block font-semibold tabular-nums">{when}</span>
            <span className="mt-0.5 block truncate text-lg font-bold">{name}</span>
          </span>
          <StatusChip status={b.status} className="mt-0.5 shrink-0" />
        </span>
        <span className="mt-1 block text-sm text-muted-foreground">
          {b.serviceName} · <span className="price font-semibold">{formatPence(b.pricePence)}</span>
          {showBarber ? ` · ${b.staffName}` : ""}
        </span>
        {note || flags.length || b.source === "walk_in" || (b.anyBarber && b.status === "pending") ? (
          <span className="mt-2 flex flex-wrap gap-1.5">
            {note ? <FlagChip>{note}</FlagChip> : null}
            {flags.map((f) => (
              <FlagChip key={f} tone={f === "expired" || f === "stale" ? "warning" : "neutral"}>
                {REQUEST_FLAG_LABELS[f]}
              </FlagChip>
            ))}
            {b.source === "walk_in" ? <FlagChip>Walk-in</FlagChip> : null}
            {b.anyBarber && b.status === "pending" ? <FlagChip>Any barber</FlagChip> : null}
          </span>
        ) : null}
      </button>
      {primary ? <PrimaryButton booking={booking} action={primary} /> : null}
    </div>
  );
}

/** Walk-in and Booking buttons (start on `date`). Hidden for accounts that don't take bookings. */
export function NewBookingButtons({ date, className }: { date: string; className?: string }) {
  const { show, setup } = useBookings();
  const canBook = setup.actor.role !== "barber" ? setup.barbers.length > 0 : setup.barbers.some((b) => b.id === setup.actor.staffId);
  if (!canBook) return null;
  const open = (mode: NewKind) => show({ kind: "new", mode, date });
  return (
    <div className={cn("flex flex-wrap gap-3", className)}>
      <Button variant="pop" onClick={() => open("walk_in")}>
        <UserPlus aria-hidden />
        Walk-in
      </Button>
      <Button variant="outline" onClick={() => open("phone")}>
        <Phone aria-hidden />
        Booking
      </Button>
    </div>
  );
}
