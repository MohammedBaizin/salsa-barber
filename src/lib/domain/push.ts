/**
 * Booking alerts on staff phones (spec §10, §11): who gets which alert, what it says, and which push services
 * subscriptions may point at. Text never includes a phone number.
 */
import { dateKey, formatDateTime } from "./time";

export type PushKind = "request" | "change" | "cancel";

export type PushPayload = { title: string; body: string; url: string; tag: string };

/** Most devices one login can have alerts on (the oldest is dropped beyond this). */
export const MAX_PUSH_DEVICES = 10;

/** Real browser push services only (Google/Chrome, Apple/Safari, Mozilla/Firefox, Microsoft/Edge). */
const PUSH_SERVICES = [
  /^https:\/\/fcm\.googleapis\.com\//,
  /^https:\/\/android\.googleapis\.com\//,
  /^https:\/\/web\.push\.apple\.com\//,
  /^https:\/\/updates\.push\.services\.mozilla\.com\//,
  /^https:\/\/[a-z0-9-]+\.notify\.windows\.com\//,
];

/**
 * Whether a subscription endpoint may be stored. `testOrigin` (from PUSH_TEST_ORIGIN, set only by the end-to-end
 * test run) allows a local stand-in push service.
 */
export function isAllowedPushEndpoint(endpoint: string, testOrigin?: string | null): boolean {
  if (endpoint.length > 1000) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (testOrigin && url.origin === testOrigin) return true;
  return url.protocol === "https:" && PUSH_SERVICES.some((p) => p.test(endpoint));
}

export type AlertPerson = { id: string; role: "admin" | "owner" | "barber"; active: boolean; deleted: boolean };

/** Admin and owner get every online request/change/cancel; a barber only their own; never switched-off or deleted accounts. */
export function pushRecipients(people: AlertPerson[], bookingStaffId: string): string[] {
  return people
    .filter((p) => p.active && !p.deleted && (p.role === "admin" || p.role === "owner" || p.id === bookingStaffId))
    .map((p) => p.id);
}

export type PushBooking = {
  name: string;
  serviceName: string;
  barberName: string;
  startsAt: Date;
  previousStartsAt?: Date | null;
};

const oneLine = (s: string) => s.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();

/** "New booking request" / "Jo · Skin Fade with Sam · Fri 20 Nov, 4:00pm". New and changed open Today; cancelled opens that day in the Calendar. */
export function pushMessage(kind: PushKind, b: PushBooking): PushPayload {
  const who = `${oneLine(b.name)} · ${oneLine(b.serviceName)} with ${oneLine(b.barberName)}`;
  const when = formatDateTime(b.startsAt);
  switch (kind) {
    case "request":
      return { title: "New booking request", body: `${who} · ${when}`, url: "/dashboard", tag: `booking-${b.startsAt.getTime()}` };
    case "change":
      return {
        title: "Booking changed by the customer",
        body: `${who} · ${when}${b.previousStartsAt ? ` (was ${formatDateTime(b.previousStartsAt)})` : ""}`,
        url: "/dashboard",
        tag: `booking-${b.startsAt.getTime()}`,
      };
    case "cancel":
      return {
        title: "Booking cancelled by the customer",
        body: `${who} · ${when}`,
        url: `/dashboard/calendar?date=${dateKey(b.startsAt)}`,
        tag: `booking-${b.startsAt.getTime()}`,
      };
  }
}

export const TEST_PUSH: PushPayload = {
  title: "Booking alerts are working",
  body: "You'll get an alert like this when a booking request comes in.",
  url: "/dashboard/account",
  tag: "test",
};
