/** Settings cards (spec §8.8): one schema per card, each saved separately. Ranges mirror the SQL checks. */
import { z } from "zod";
import { fitsHours, type WeeklyHours } from "./hours";
import { addDays, type DateKey, formatMinutes } from "./time";

export const MIN_NOTICE_CHOICES = [0, 30, 60, 120, 180, 240, 360, 720, 1440, 2880] as const;
export const CHANGE_CUTOFF_CHOICES = [0, 30, 60, 120, 180, 240, 360, 720, 1440, 2880] as const;

/** 0 -> "No minimum", 30 -> "30 minutes", 60 -> "1 hour", 720 -> "12 hours", 2880 -> "2 days". */
export function noticeLabel(minutes: number): string {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (minutes === 0) return "No minimum";
  if (minutes % 1440 === 0) return plural(minutes / 1440, "day");
  if (minutes % 60 === 0) return plural(minutes / 60, "hour");
  if (minutes < 60) return plural(minutes, "minute");
  return formatMinutes(minutes);
}

const int = (min: number, max: number, message: string) =>
  z.coerce.number().int(message).min(min, message).max(max, message);

export const bookingRulesSchema = z.object({
  minNoticeMinutes: z.coerce.number().refine((n) => (MIN_NOTICE_CHOICES as readonly number[]).includes(n), "Choose one of the options."),
  bookingWindowDays: int(1, 365, "Choose between 1 and 365 days."),
  dueBackWeeks: int(1, 52, "Choose between 1 and 52 weeks."),
  maxOpenRequests: int(1, 20, "Choose between 1 and 20."),
  changeCutoffMinutes: z.coerce.number().refine((n) => (CHANGE_CUTOFF_CHOICES as readonly number[]).includes(n), "Choose one of the options."),
});

/** Blank fields hide the rating on the website. */
export const googleSchema = z
  .object({
    rating: z.string().trim().transform((v, ctx) => {
      if (v === "") return null;
      const n = Number(v.replace(",", "."));
      if (!Number.isFinite(n) || n < 0 || n > 5) {
        ctx.addIssue({ code: "custom", message: "Enter a rating between 0 and 5, e.g. 4.8." });
        return z.NEVER;
      }
      return Math.round(n * 10) / 10;
    }),
    count: z.string().trim().transform((v, ctx) => {
      if (v === "") return null;
      if (!/^\d{1,7}$/.test(v)) {
        ctx.addIssue({ code: "custom", message: "Enter a whole number of reviews." });
        return z.NEVER;
      }
      return Number(v);
    }),
    url: z.string().trim().transform((v, ctx) => {
      if (v === "") return null;
      try {
        const u = new URL(v);
        if (u.protocol !== "https:" || v.length > 500) throw new Error();
        return u.toString();
      } catch {
        ctx.addIssue({ code: "custom", message: "Enter a link starting with https://" });
        return z.NEVER;
      }
    }),
  });

/** Website notes: ≤ 200 characters; line breaks become spaces; blank hides them. */
const noteField = z
  .string()
  .transform((v) => v.replace(/\s+/g, " ").trim())
  .pipe(z.string().max(200, "Please keep this to 200 characters."))
  .transform((v) => (v === "" ? null : v));

export const websiteNotesSchema = z.object({ walkInText: noteField, discountText: noteField });

export const onlineBookingSchema = z.object({ onlineBooking: z.enum(["on", "off"]) });

export const publicThemeSchema = z.object({ publicTheme: z.enum(["light", "dark"]) });

export const closureSchema = z.object({
  closedOn: z.iso.date("Choose a date."),
  reason: z.string().transform((v) => v.replace(/\s+/g, " ").trim()).pipe(z.string().max(100)).optional().default(""),
});

/** Closed days can be added from today up to two years ahead. */
export const CLOSURE_MAX_DAYS_AHEAD = 730;
export const CLOSURE_TAKEN = "That day is already marked as closed.";

export function closureDateProblem(date: DateKey, today: DateKey): string | null {
  if (date < today) return "Choose today or a later date.";
  if (date > addDays(today, CLOSURE_MAX_DAYS_AHEAD)) return "Choose a date within the next two years.";
  return null;
}

/** Upcoming bookings that don't fit the new opening hours (they stay booked; nothing is moved). */
export function bookingsOutsideHours(hours: WeeklyHours, bookings: { startsAt: Date; endsAt: Date }[]): number {
  return bookings.filter((b) => !fitsHours(hours, b.startsAt, b.endsAt)).length;
}

const them = (n: number) => (n === 1 ? { it: "It stays", obj: "it" } : { it: "They stay", obj: "them" });

/** "2 upcoming bookings fall outside the new hours. They stay booked: …" */
export function hoursChangeWarning(outside: number): string | null {
  if (outside === 0) return null;
  const t = them(outside);
  return `${outside === 1 ? "1 upcoming booking falls" : `${outside} upcoming bookings fall`} outside the new hours. ${t.it} booked: move or cancel ${t.obj} from the Calendar if needed.`;
}

/** "1 booking is on that day. It stays booked: …" */
export function closureWarning(bookings: number): string | null {
  if (bookings === 0) return null;
  const t = them(bookings);
  return `${bookings === 1 ? "1 booking is" : `${bookings} bookings are`} on that day. ${t.it} booked: move or cancel ${t.obj} from the Calendar.`;
}

/** Card ids, in page order (jump bar on phones). */
export const SETTINGS_SECTIONS = [
  { id: "online-booking", label: "Online booking" },
  { id: "hours", label: "Opening hours" },
  { id: "closed-days", label: "Closed days" },
  { id: "booking-rules", label: "Booking rules" },
  { id: "google", label: "Google rating" },
  { id: "website-notes", label: "Website notes" },
  { id: "website-theme", label: "Website theme" },
] as const;
