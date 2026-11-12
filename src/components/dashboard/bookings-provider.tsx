"use client";

import { createContext, use, useCallback, useState, type ReactNode } from "react";
import type { BookingActionState } from "@/lib/dashboard/action-state";
import type { BookingSetup, DashboardBooking } from "@/lib/dashboard/types";
import { formatPence } from "@/lib/domain/money";
import { MESSAGE_TITLES, type MessagePlan } from "@/lib/domain/staff-bookings";
import { bookingName, type RequestFlag } from "@/lib/domain/today";
import { Toast } from "./form-parts";
import { BookingDetailsView, ChangeBarberView, ChangeServiceView, DeclineView, MessageView, NewBookingView, RescheduleView } from "./booking-views";
import { Sheet } from "./sheet";

export type NewKind = "walk_in" | "phone";

export type SheetView =
  | { kind: "details"; booking: DashboardBooking; flags: RequestFlag[] }
  | { kind: "decline" | "reschedule" | "barber" | "service"; booking: DashboardBooking }
  | { kind: "message"; booking: DashboardBooking; plan: MessagePlan; notice: string | null }
  | { kind: "new"; mode: NewKind; date: string };

type Ctx = {
  setup: BookingSetup;
  today: string;
  show: (view: SheetView) => void;
  close: () => void;
  /** After any successful action: offer the customer message, or close with a notice. */
  finish: (done: NonNullable<BookingActionState["done"]>) => void;
  notify: (text: string) => void;
};

const BookingsContext = createContext<Ctx | null>(null);

export function useBookings(): Ctx {
  const ctx = use(BookingsContext);
  if (!ctx) throw new Error("useBookings needs <BookingsProvider>");
  return ctx;
}

function titleFor(view: SheetView): { title: string; description?: string } {
  switch (view.kind) {
    case "details":
      return { title: bookingName(view.booking), description: `${view.booking.serviceName} · ${formatPence(view.booking.pricePence)}` };
    case "decline":
      return { title: "Decline request", description: bookingName(view.booking) };
    case "reschedule":
      return { title: "Reschedule", description: `${bookingName(view.booking)} · ${view.booking.serviceName}` };
    case "barber":
      return { title: "Change barber", description: `${bookingName(view.booking)} · ${view.booking.serviceName}` };
    case "service":
      return { title: "Change service or price", description: bookingName(view.booking) };
    case "message":
      return { title: "Send to customer", description: view.notice ?? MESSAGE_TITLES[view.plan.kind] };
    case "new":
      return { title: view.mode === "walk_in" ? "Add a walk-in" : "New booking" };
  }
}

/**
 * Bookings on a dashboard page share one sheet (spec §8.2): details with every allowed action, the action forms,
 * and "Send to customer: WhatsApp | SMS" afterwards.
 */
export function BookingsProvider({ setup, today, children }: { setup: BookingSetup; today: string; children: ReactNode }) {
  const [view, setView] = useState<SheetView | null>(null);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);

  const notify = useCallback((text: string) => setToast({ text, id: Date.now() }), []);
  const show = useCallback((next: SheetView) => {
    setView(next);
    setOpen(true);
  }, []);
  const close = useCallback(() => setOpen(false), []);
  const finish = useCallback<Ctx["finish"]>(
    ({ booking, message, notice }) => {
      if (message && booking.clientPhone) {
        show({ kind: "message", booking, plan: message, notice });
      } else {
        setOpen(false);
        notify(notice);
      }
    },
    [notify, show],
  );

  const heading = view ? titleFor(view) : { title: "Booking" };

  return (
    <BookingsContext value={{ setup, today, show, close, finish, notify }}>
      {children}
      <Sheet open={open} onClose={() => setOpen(false)} title={heading.title} description={heading.description}>
        {open && view ? <SheetBody view={view} /> : null}
      </Sheet>
      <Toast message={toast} onDone={() => setToast(null)} />
    </BookingsContext>
  );
}

function SheetBody({ view }: { view: SheetView }) {
  switch (view.kind) {
    case "details":
      return <BookingDetailsView key={view.booking.id} booking={view.booking} flags={view.flags} />;
    case "decline":
      return <DeclineView booking={view.booking} />;
    case "reschedule":
      return <RescheduleView booking={view.booking} />;
    case "barber":
      return <ChangeBarberView booking={view.booking} />;
    case "service":
      return <ChangeServiceView booking={view.booking} />;
    case "message":
      return <MessageView booking={view.booking} plan={view.plan} />;
    case "new":
      return <NewBookingView mode={view.mode} date={view.date} />;
  }
}
