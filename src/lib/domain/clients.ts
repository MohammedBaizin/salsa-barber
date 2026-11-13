/**
 * Client labels and list logic. Labels are derived, never stored (spec §6):
 * Regular = 3+ completed visits · New = no completed visit ·
 * Due back = last completed visit more than `dueBackWeeks` ago and nothing upcoming.
 */
import { z } from "zod";
import { normaliseUkMobile, PHONE_ERROR } from "./phone";
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

// ---------------------------------------------------------------------------
// Clients list URL state (GET form: works without JavaScript; Back returns to the same list)
// ---------------------------------------------------------------------------

export type ClientListParams = { q: string; filter: ClientFilter; barber: string | null; page: number };

const FILTER_VALUES = CLIENT_FILTERS.map((f) => f.value);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseClientParams(search: Record<string, string | string[] | undefined>): ClientListParams {
  const filter = one(search.filter) as ClientFilter;
  const barber = one(search.barber);
  const page = Number.parseInt(one(search.page) ?? "", 10);
  return {
    q: (one(search.q) ?? "").replace(/\s+/g, " ").trim().slice(0, 80),
    filter: FILTER_VALUES.includes(filter) ? filter : "all",
    barber: barber && UUID_RE.test(barber) ? barber : null,
    page: Number.isFinite(page) && page > 1 ? Math.min(page, 10_000) : 1,
  };
}

export function clientsHref(p: Partial<ClientListParams>): string {
  const q = new URLSearchParams();
  if (p.q) q.set("q", p.q);
  if (p.filter && p.filter !== "all") q.set("filter", p.filter);
  if (p.barber) q.set("barber", p.barber);
  if (p.page && p.page > 1) q.set("page", String(p.page));
  const s = q.toString();
  return s ? `/dashboard/clients?${s}` : "/dashboard/clients";
}

/** Search arguments for client_list(): a phone fragment, or an escaped name. */
export function clientSearchArgs(q: string): { p_name: string | null; p_phone: string | null } {
  if (!q) return { p_name: null, p_phone: null };
  const phone = phoneSearchFragment(q);
  return phone ? { p_name: null, p_phone: phone } : { p_name: escapeLike(q), p_phone: null };
}

/** "Showing 21–40 of 57" */
export function pageSummary(page: number, total: number, perPage = CLIENTS_PER_PAGE): string {
  if (total === 0) return "No clients";
  const from = (page - 1) * perPage + 1;
  const to = Math.min(total, page * perPage);
  return `Showing ${from}–${to} of ${total}`;
}

/** Edit details (owner/admin): name and UK mobile. */
export const clientEditSchema = z.object({
  id: z.uuid(),
  name: z
    .string()
    .transform((v) => v.replace(/\s+/g, " ").trim())
    .pipe(z.string().min(1, "Please enter their name.").max(80, "Keep the name under 80 characters.")),
  phone: z.string().transform((v, ctx) => {
    const e164 = normaliseUkMobile(v);
    if (!e164) {
      ctx.addIssue({ code: "custom", message: PHONE_ERROR });
      return z.NEVER;
    }
    return e164;
  }),
});

export const DUPLICATE_PHONE_ERROR = "That number already belongs to another client.";
