"use client";

import { createContext, use, useState, type ReactNode } from "react";
import { MessageCircle, Phone } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { withDates, type DashboardBooking } from "@/lib/dashboard/types";
import { formatPence } from "@/lib/domain/money";
import { formatUkMobile } from "@/lib/domain/phone";
import { dateKey, formatDayLong, formatMinutes, formatRelativeDay, formatTime } from "@/lib/domain/time";
import { bookingName, REQUEST_FLAG_LABELS, SOURCE_LABELS, STATUS_LABELS, type RequestFlag } from "@/lib/domain/today";
import { cn } from "@/lib/utils";
import { Sheet } from "./sheet";
import { FlagChip, STATUS_STYLES, StatusChip } from "./status-chip";

type Open = (booking: DashboardBooking, flags: RequestFlag[]) => void;
const SheetContext = createContext<Open | null>(null);

/**
 * One details sheet for every booking card on the page. Tapping a card opens it.
 * Actions (Accept, Done, Reschedule…) are added in the booking actions phase.
 */
export function BookingSheetProvider({ today, children }: { today: string; children: ReactNode }) {
  const [selected, setSelected] = useState<{ booking: DashboardBooking; flags: RequestFlag[] } | null>(null);
  const [open, setOpen] = useState(false);

  return (
    <SheetContext value={(booking, flags) => {
      setSelected({ booking, flags });
      setOpen(true);
    }}>
      {children}
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={selected ? bookingName(selected.booking) : "Booking"}
        description={selected ? `${selected.booking.serviceName} · ${formatPence(selected.booking.pricePence)}` : undefined}
        footer={selected?.booking.clientPhone ? <CallButton phone={selected.booking.clientPhone} /> : null}
      >
        {selected ? <BookingDetails booking={selected.booking} flags={selected.flags} today={today} /> : null}
      </Sheet>
    </SheetContext>
  );
}

function CallButton({ phone }: { phone: string }) {
  return (
    <a href={`tel:${phone}`} className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>
      <Phone aria-hidden />
      Call {formatUkMobile(phone)}
    </a>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3 py-2.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 font-medium break-words">{children}</dd>
    </div>
  );
}

function BookingDetails({ booking, flags, today }: { booking: DashboardBooking; flags: RequestFlag[]; today: string }) {
  const b = withDates(booking);
  const day = dateKey(b.startsAt);
  const relative = formatRelativeDay(day, today);
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
        <Row label="Status">{STATUS_LABELS[b.status]}{b.cancelledByClient ? " by the customer" : ""}</Row>
        <Row label="Booked">{SOURCE_LABELS[b.source]}</Row>
        {b.declineReason ? <Row label="Reason">{b.declineReason}</Row> : null}
        {b.clientPhone && b.status !== "pending" ? (
          <Row label="Message">
            <span className="inline-flex items-center gap-1.5">
              <MessageCircle aria-hidden className="size-4" />
              {b.messageSentAt ? "Sent to the customer" : "Not sent yet"}
            </span>
          </Row>
        ) : null}
      </dl>
    </div>
  );
}

/**
 * Booking card: coloured left edge + status word, time, client, service · price · barber, chips.
 * The whole card opens the details sheet.
 */
export function BookingCard({
  booking,
  today,
  flags = [],
  showDay = false,
  note,
}: {
  booking: DashboardBooking;
  today: string;
  flags?: RequestFlag[];
  /** Show "Tomorrow" / "Fri 9 Oct" before the time (lists that span days). */
  showDay?: boolean;
  /** Extra line, e.g. "in 25 min". */
  note?: string | null;
}) {
  const open = use(SheetContext);
  const b = withDates(booking);
  const when = showDay ? `${formatRelativeDay(dateKey(b.startsAt), today)}, ${formatTime(b.startsAt)}` : formatTime(b.startsAt);
  const name = bookingName(b);

  return (
    <button
      type="button"
      onClick={() => open?.(booking, flags)}
      data-testid="booking-card"
      data-status={b.status}
      aria-haspopup="dialog"
      className={cn(
        "block w-full rounded-xl border border-l-4 bg-card p-3 text-left transition-colors hover:bg-muted/60 sm:p-4",
        STATUS_STYLES[b.status].edge,
        flags.includes("stale") && "ring-2 ring-status-request-foreground/60",
      )}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block font-semibold tabular-nums">{when}</span>
          <span className="mt-0.5 block truncate text-lg font-bold">{name}</span>
        </span>
        <StatusChip status={b.status} className="mt-0.5 shrink-0" />
      </span>
      <span className="mt-1 block text-sm text-muted-foreground">
        {b.serviceName} · <span className="price font-semibold">{formatPence(b.pricePence)}</span> · {b.staffName}
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
  );
}
