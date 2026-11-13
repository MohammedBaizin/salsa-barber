/** Services and prices (spec §8.6). */
import { z } from "zod";
import { MAX_PRICE_PENCE, parsePounds } from "./money";
import { formatMinutes } from "./time";

/** Dashboard choices: 5-minute steps up to 4 hours (the database allows up to 8). */
export const DURATION_CHOICES = Array.from({ length: 48 }, (_, i) => (i + 1) * 5);
export const MAX_DASHBOARD_DURATION = 240;

export const serviceInputSchema = z.object({
  name: z.string().transform((v) => v.replace(/\s+/g, " ").trim()).pipe(z.string().min(1, "Please enter a name.").max(80, "Please use 80 characters or fewer.")),
  price: z.string().transform((value, ctx) => {
    const pence = parsePounds(value);
    if (pence === null || pence > MAX_PRICE_PENCE) {
      ctx.addIssue({ code: "custom", message: "Enter a price in pounds, e.g. 17 or 17.50 (up to £1,000)." });
      return z.NEVER;
    }
    return pence;
  }),
  durationMin: z.coerce
    .number()
    .int()
    .refine((n) => n >= 5 && n <= MAX_DASHBOARD_DURATION && n % 5 === 0, "Choose a length in 5-minute steps, up to 4 hours."),
});

export type ServiceInput = z.output<typeof serviceInputSchema>;

/** "30 min", "1 hr 30 min" */
export const formatDuration = formatMinutes;

export function sortServices<T extends { sort: number; name: string }>(services: T[]): T[] {
  return [...services].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "en-GB"));
}

/** New sort values after moving one item up or down (for the reorder arrows). */
export function moveItem<T extends { id: string }>(items: T[], id: string, direction: -1 | 1): { id: string; sort: number }[] {
  const i = items.findIndex((x) => x.id === id);
  const j = i + direction;
  const order = [...items];
  if (i >= 0 && j >= 0 && j < order.length) [order[i], order[j]] = [order[j], order[i]];
  return order.map((x, index) => ({ id: x.id, sort: (index + 1) * 10 }));
}

/**
 * Which days a service can be booked online (e.g. OAP Cut Mon–Thu). Checkbox values "1".."7" (ISO weekdays).
 * All seven → null ("every day the shop is open"); none → an error.
 */
export function parseServiceDays(values: string[]): { ok: true; days: number[] | null } | { ok: false; error: string } {
  const days = [...new Set(values.map(Number).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))].sort((a, b) => a - b);
  if (days.length === 0) return { ok: false, error: "Choose at least one day." };
  return { ok: true, days: days.length === 7 ? null : days };
}

export const SERVICE_HAS_BOOKINGS = "This service has bookings, so it can't be deleted. Switch it off instead: it disappears from the website and booking, and past bookings keep it.";
