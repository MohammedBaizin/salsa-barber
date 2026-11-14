/**
 * Owner alert emails (spec §10): a new online request, a customer's change, a customer's cancel.
 * Name, service, barber and time only: never the phone number. Plain text.
 */
import { formatDateTime } from "./time";

export type OwnerAlertKind = "request" | "change" | "cancel";

export type OwnerAlert = {
  kind: OwnerAlertKind;
  name: string;
  serviceName: string;
  barberName: string;
  anyBarber: boolean;
  startsAt: Date;
  /** For a change: the time it was before. */
  previousStartsAt?: Date | null;
};

const HEADINGS: Record<OwnerAlertKind, string> = {
  request: "New booking request",
  change: "Booking changed by the customer",
  cancel: "Booking cancelled by the customer",
};

/** Strips line breaks and control characters (names come from the public form). */
const clean = (s: string) => s.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();

export function ownerAlertEmail(alert: OwnerAlert, shop: { name: string; siteUrl: string }): { subject: string; text: string } {
  const name = clean(alert.name);
  const when = formatDateTime(alert.startsAt);
  const barber = alert.anyBarber && alert.kind !== "cancel" ? `${clean(alert.barberName)} (any barber)` : clean(alert.barberName);
  const subject = `${HEADINGS[alert.kind]} · ${name} · ${clean(alert.serviceName)} · ${when}`;
  const dashboard = `${shop.siteUrl.replace(/\/$/, "")}/dashboard`;
  const lines = [
    `${HEADINGS[alert.kind]}.`,
    "",
    `Name: ${name}`,
    `Service: ${clean(alert.serviceName)}`,
    `Barber: ${barber}`,
    `When: ${when}`,
  ];
  if (alert.kind === "change" && alert.previousStartsAt) lines.push(`Was: ${formatDateTime(alert.previousStartsAt)}`);
  lines.push("");
  if (alert.kind === "cancel") {
    lines.push(`The time is free again. See the Calendar: ${dashboard}/calendar`);
  } else {
    lines.push(`Accept or decline it in the dashboard: ${dashboard}`);
    lines.push("The customer is waiting for your WhatsApp or text.");
  }
  lines.push("", `${shop.name} booking alerts. Phone numbers are never included in these emails.`);
  return { subject, text: lines.join("\n") };
}
