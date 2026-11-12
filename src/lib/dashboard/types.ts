/**
 * Booking shape passed from server components to client components (plain JSON: times are ISO strings).
 * Built only from rows the signed-in person may read (RLS).
 */
import type { BookingSource, BookingStatus } from "@/lib/domain/today";

export type DashboardBooking = {
  id: string;
  status: BookingStatus;
  source: BookingSource;
  startsAt: string;
  endsAt: string;
  createdAt: string;
  serviceId: string;
  serviceName: string;
  pricePence: number;
  durationMin: number;
  staffId: string;
  staffName: string;
  clientId: string | null;
  /** Client's stored name (null for anonymous walk-ins and deleted clients). */
  clientName: string | null;
  /** E.164, null without a client. */
  clientPhone: string | null;
  /** Name given for this booking when it differs from the client's stored name. */
  bookedName: string | null;
  anyBarber: boolean;
  changedFrom: string | null;
  declineReason: string | null;
  messageSentAt: string | null;
  cancelledByClient: boolean;
  /** For the customer's private link in messages (staff only). */
  manageToken: string;
};

/** The same booking with Date objects, for the domain functions. */
export type BookingTimes = Omit<DashboardBooking, "startsAt" | "endsAt" | "createdAt"> & {
  startsAt: Date;
  endsAt: Date;
  createdAt: Date;
};

export function withDates(b: DashboardBooking): BookingTimes {
  return { ...b, startsAt: new Date(b.startsAt), endsAt: new Date(b.endsAt), createdAt: new Date(b.createdAt) };
}

export type BarberOption = { id: string; name: string };

/** What the booking sheets need: services, bookable barbers (and what they do), who is acting, shop details. */
export type BookingSetup = {
  actor: { staffId: string; role: "admin" | "owner" | "barber"; bookable: boolean };
  services: { id: string; name: string; pricePence: number; durationMin: number; days: number[] | null }[];
  barbers: (BarberOption & { serviceIds: string[] })[];
  shop: { name: string; address: string; phoneDisplay: string; siteUrl: string; bookingEnabled: boolean };
};
