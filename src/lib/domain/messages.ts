/**
 * Customer messages (spec §5.6): plain text, no emoji, built on demand and never stored.
 * The shop sends them with one tap via a prefilled WhatsApp (wa.me) or SMS (sms:) link.
 */
import { formatPence } from "./money";
import { waDigits } from "./phone";
import { formatDateTime } from "./time";

export type MessageShop = {
  name: string;
  /** One line, e.g. "41 Liverpool Road South, Maghull L31 7BN". */
  address: string;
  phoneDisplay: string;
  siteUrl: string;
  bookingEnabled: boolean;
};

export type MessageBooking = {
  /** booked_name, else the client's name. */
  name: string;
  serviceName: string;
  barberName: string;
  startsAt: Date;
  pricePence: number;
  manageToken: string;
};

export type UpdateChanges = {
  previousStartsAt?: Date;
  previousBarberName?: string;
  previousServiceName?: string;
};

/** First word of the name for a friendly greeting. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name.trim();
}

export function manageUrl(shop: Pick<MessageShop, "siteUrl">, token: string): string {
  return `${shop.siteUrl.replace(/\/$/, "")}/booking/${token}`;
}

function details(b: MessageBooking, shop: MessageShop): string {
  return [
    `${b.serviceName} with ${b.barberName}`,
    formatDateTime(b.startsAt),
    formatPence(b.pricePence),
    "",
    shop.address,
  ].join("\n");
}

function rebookLine(shop: MessageShop): string {
  return shop.bookingEnabled
    ? `You can book another time here: ${shop.siteUrl.replace(/\/$/, "")}/book`
    : `Please call us on ${shop.phoneDisplay} to find another time.`;
}

export function acceptedMessage(b: MessageBooking, shop: MessageShop): string {
  return [
    `Hi ${firstName(b.name)}, your booking at ${shop.name} is confirmed.`,
    "",
    details(b, shop),
    "",
    `View, change or cancel: ${manageUrl(shop, b.manageToken)}`,
    "",
    `See you soon,`,
    shop.name,
  ].join("\n");
}

export function declinedMessage(b: MessageBooking, shop: MessageShop, reason?: string | null): string {
  const lines = [
    `Hi ${firstName(b.name)}, sorry, we can't fit in your ${b.serviceName} on ${formatDateTime(b.startsAt)}.`,
  ];
  const r = reason?.replace(/\s+/g, " ").trim();
  if (r) lines.push(r);
  lines.push("", rebookLine(shop), "", shop.name);
  return lines.join("\n");
}

export function updatedMessage(b: MessageBooking, shop: MessageShop, changes: UpdateChanges): string {
  const what: string[] = [];
  if (changes.previousStartsAt) what.push(`New time: ${formatDateTime(b.startsAt)} (was ${formatDateTime(changes.previousStartsAt)})`);
  if (changes.previousBarberName) what.push(`Now with ${b.barberName} (was ${changes.previousBarberName})`);
  if (changes.previousServiceName) what.push(`Service: ${b.serviceName}, ${formatPence(b.pricePence)} (was ${changes.previousServiceName})`);
  return [
    `Hi ${firstName(b.name)}, your booking at ${shop.name} has changed.`,
    ...(what.length ? ["", ...what] : []),
    "",
    details(b, shop),
    "",
    `View, change or cancel: ${manageUrl(shop, b.manageToken)}`,
    "",
    shop.name,
  ].join("\n");
}

export function cancelledMessage(b: MessageBooking, shop: MessageShop): string {
  return [
    `Hi ${firstName(b.name)}, your ${b.serviceName} at ${shop.name} on ${formatDateTime(b.startsAt)} has been cancelled.`,
    "",
    rebookLine(shop),
    "",
    shop.name,
  ].join("\n");
}

export function dueBackMessage(name: string, shop: MessageShop): string {
  const next = shop.bookingEnabled
    ? `Book your next visit here: ${shop.siteUrl.replace(/\/$/, "")}/book`
    : `Give us a call on ${shop.phoneDisplay} to book your next visit.`;
  return [`Hi ${firstName(name)}, it's been a while since your last visit to ${shop.name}.`, "", next, "", shop.name].join("\n");
}

/** The customer's own WhatsApp to the shop from their private booking page. */
export function customerChangeRequest(b: MessageBooking, shop: Pick<MessageShop, "name" | "siteUrl">): string {
  return [
    `Hi ${shop.name}, I'd like to change my booking:`,
    `${b.serviceName} with ${b.barberName}, ${formatDateTime(b.startsAt)}.`,
    `Name: ${b.name}`,
    `Booking: ${manageUrl(shop, b.manageToken)}`,
  ].join("\n");
}

export function whatsappLink(e164: string, text: string): string {
  return `https://wa.me/${waDigits(e164)}?text=${encodeURIComponent(text)}`;
}

export function smsLink(e164: string, text: string): string {
  return `sms:${e164}?&body=${encodeURIComponent(text)}`;
}
