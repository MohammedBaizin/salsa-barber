/**
 * Wall-clock time in the shop's time zone (Europe/London), independent of the device or server zone.
 * All business rules work on London date keys ("YYYY-MM-DD") and minutes after local midnight.
 * DST-safe: conversions go through @date-fns/tz. Times inside the spring-forward gap (01:00–02:00)
 * move forward; ambiguous autumn times resolve to BST. The shop never trades at those hours.
 */
import { TZDate } from "@date-fns/tz";
import { TIMEZONE } from "@/lib/site";

export type DateKey = string; // "YYYY-MM-DD" in London

const pad = (n: number) => String(n).padStart(2, "0");

/** London calendar parts of an instant. */
export function londonParts(date: Date) {
  const z = new TZDate(date.getTime(), TIMEZONE);
  const weekday = z.getDay(); // 0 = Sunday
  return {
    year: z.getFullYear(),
    month: z.getMonth() + 1,
    day: z.getDate(),
    hour: z.getHours(),
    minute: z.getMinutes(),
    isoWeekday: weekday === 0 ? 7 : weekday,
  };
}

/** "YYYY-MM-DD" of an instant in London. */
export function dateKey(date: Date): DateKey {
  const p = londonParts(date);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Minutes after London midnight of an instant. */
export function minuteOfDay(date: Date): number {
  const p = londonParts(date);
  return p.hour * 60 + p.minute;
}

function splitKey(key: DateKey): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) throw new Error(`Invalid date key: ${key}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function isDateKey(value: unknown): value is DateKey {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = splitKey(value);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** The instant for a London date + minutes after midnight. */
export function fromLondon(key: DateKey, minutes: number): Date {
  const [y, m, d] = splitKey(key);
  const z = TZDate.tz(TIMEZONE, y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
  return new Date(z.getTime());
}

/** Calendar arithmetic on date keys (no time zone involved). */
export function addDays(key: DateKey, days: number): DateKey {
  const [y, m, d] = splitKey(key);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: DateKey, b: DateKey): number {
  const [y1, m1, d1] = splitKey(a);
  const [y2, m2, d2] = splitKey(b);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** ISO weekday of a date key: 1 = Monday … 7 = Sunday. */
export function isoWeekday(key: DateKey): number {
  const [y, m, d] = splitKey(key);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return w === 0 ? 7 : w;
}

/** "09:30" -> 570. */
export function parseHHMM(value: string): number {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!m) throw new Error(`Invalid time: ${value}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** 570 -> "09:30". */
export function toHHMM(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

// ---------------------------------------------------------------------------
// Display (UK style, always London time)
// ---------------------------------------------------------------------------

const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_LONG = [
  "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December",
];

export const dayShortName = (isoDay: number) => DAY_SHORT[isoDay - 1];
export const dayLongName = (isoDay: number) => DAY_LONG[isoDay - 1];

/** 960 -> "4:00pm", 0 -> "12:00am", 720 -> "12:00pm". */
export function formatClock(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m)}${h < 12 ? "am" : "pm"}`;
}

/** "4:00pm" */
export function formatTime(date: Date): string {
  return formatClock(minuteOfDay(date));
}

/** "Fri 9 Oct" (from an instant or a date key). */
export function formatDay(value: Date | DateKey): string {
  const key = typeof value === "string" ? value : dateKey(value);
  const [, m, d] = splitKey(key);
  return `${dayShortName(isoWeekday(key))} ${d} ${MONTH_SHORT[m - 1]}`;
}

/** "Friday 9 October" */
export function formatDayLong(value: Date | DateKey): string {
  const key = typeof value === "string" ? value : dateKey(value);
  const [, m, d] = splitKey(key);
  return `${dayLongName(isoWeekday(key))} ${d} ${MONTH_LONG[m - 1]}`;
}

/**
 * ISO weekdays as text: [1,2,3,4] -> "Mon–Thu", [1,3,5] -> "Mon, Wed & Fri", [6,7] -> "Sat & Sun",
 * all seven or null -> "every day".
 */
export function formatDays(days: readonly number[] | null | undefined): string {
  const sorted = [...new Set(days ?? [])].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
  if (!days || sorted.length === 7) return "every day";
  if (sorted.length === 0) return "no days";
  const runs: number[][] = [];
  for (const d of sorted) {
    const last = runs.at(-1);
    if (last && d === last.at(-1)! + 1) last.push(d);
    else runs.push([d]);
  }
  const parts = runs.flatMap((r) =>
    r.length >= 3 ? [`${dayShortName(r[0])}–${dayShortName(r.at(-1)!)}`] : r.map(dayShortName),
  );
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} & ${parts.at(-1)}`;
}

/** "Fri 9 Oct, 4:00pm" */
export function formatDateTime(date: Date): string {
  return `${formatDay(date)}, ${formatTime(date)}`;
}

/** "Today", "Tomorrow" or "Fri 9 Oct", relative to `today`. */
export function formatRelativeDay(key: DateKey, today: DateKey): string {
  const diff = daysBetween(today, key);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return formatDay(key);
}

/** "25 min", "1 hr", "1 hr 5 min" */
export function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}
