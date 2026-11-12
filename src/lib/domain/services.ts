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
