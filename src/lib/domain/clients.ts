/**
 * Client labels and list logic. Labels are derived, never stored (spec §6):
 * Regular = 3+ completed visits · New = no completed visit ·
 * Due back = last completed visit more than `dueBackWeeks` ago and nothing upcoming.
 */
import { addDays, dateKey, type DateKey, fromLondon } from "./time";

export type ClientStats = {
  visits: number;
  spentPence: number;
  noShows: number;
  lastVisit: Date | null;
  nextVisit: Date | null;
  usualServiceId: string | null;
  usualStaffId: string | null;
  /** London minutes after midnight. */
  usualStartMinute: number | null;
};

export type ClientLabel = "regular" | "new" | "due_back";
export type ClientFilter = "all" | ClientLabel;

export const CLIENT_LABELS: Record<ClientLabel, string> = { regular: "Regular", new: "New", due_back: "Due back" };
export const CLIENT_FILTERS: { value: ClientFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "due_back", label: "Due back" },
  { value: "regular", label: "Regulars" },
  { value: "new", label: "New" },
];
export const CLIENTS_PER_PAGE = 20;
export const REGULAR_VISITS = 3;

export function isDueBack(s: Pick<ClientStats, "lastVisit" | "nextVisit">, now: Date, dueBackWeeks: number): boolean {
  if (!s.lastVisit || s.nextVisit) return false;
  return now.getTime() - s.lastVisit.getTime() > dueBackWeeks * 7 * 86_400_000;
}

export function clientLabels(s: Pick<ClientStats, "visits" | "lastVisit" | "nextVisit">, now: Date, dueBackWeeks: number): ClientLabel[] {
  const labels: ClientLabel[] = [];
  if (s.visits >= REGULAR_VISITS) labels.push("regular");
  if (s.visits === 0) labels.push("new");
  if (isDueBack(s, now, dueBackWeeks)) labels.push("due_back");
  return labels;
}

/** Useful order per filter: due back = longest gone first; regulars = most visits; new = newest; all = name. */
export function sortClients<T extends { name: string; createdAt: Date; stats: ClientStats }>(rows: T[], filter: ClientFilter): T[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, "en-GB", { sensitivity: "base" });
  const copy = [...rows];
  switch (filter) {
    case "due_back":
      return copy.sort((a, b) => (a.stats.lastVisit?.getTime() ?? 0) - (b.stats.lastVisit?.getTime() ?? 0) || byName(a, b));
    case "regular":
      return copy.sort((a, b) => b.stats.visits - a.stats.visits || byName(a, b));
    case "new":
      return copy.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || byName(a, b));
    default:
      return copy.sort(byName);
  }
}

/**
 * Search box: a name, or a phone number typed any way. For numbers returns the national digits without
 * the leading zero ("07123 45" -> "712345") to match inside the stored E.164 number; null for name searches.
 */
export function phoneSearchFragment(query: string): string | null {
  const q = query.trim();
  if (!/^[+\d\s\-().]+$/.test(q)) return null;
  let digits = q.replace(/\D/g, "");
  if (digits.length < 3) return null;
  if (q.startsWith("+44") || digits.startsWith("0044")) digits = digits.replace(/^(00)?44/, "");
  else if (digits.startsWith("44") && digits.length >= 11) digits = digits.slice(2);
  return digits.replace(/^0/, "");
}

/** Escapes a user search for SQL LIKE/ILIKE. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Only ever go "back" to a clients-list URL (no open redirects). */
export function safeClientsBackLink(value: string | null | undefined): string {
  if (!value || !/^\/dashboard\/clients(\?[^#\s]*)?$/.test(value)) return "/dashboard/clients";
  return value;
}

/**
 * "Book again" defaults: usual service, 3 weeks from today, usual time (rounded to 5 minutes; 10:00am if unknown).
 */
export function bookAgainDefaults(
  stats: Pick<ClientStats, "usualServiceId" | "usualStaffId" | "usualStartMinute">,
  now: Date,
): { serviceId: string | null; staffId: string | null; date: DateKey; minute: number; start: Date } {
  const date = addDays(dateKey(now), 21);
  const minute = stats.usualStartMinute == null ? 600 : Math.round(stats.usualStartMinute / 5) * 5;
  return { serviceId: stats.usualServiceId, staffId: stats.usualStaffId, date, minute, start: fromLondon(date, minute) };
}
