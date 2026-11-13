/**
 * Activity log labels (spec §8.9). Actions come from app.audit() (database triggers) and from server code
 * (passwords, two-step sign-in, backups, restores). Every action and changed column has a readable label.
 */
import { dateKey, type DateKey } from "./time";

export const ACTION_LABELS: Record<string, string> = {
  // Bookings (triggers)
  "booking.create": "Booking request",
  "booking.walk_in": "Walk-in added",
  "booking.phone": "Phone booking added",
  "booking.accept": "Request accepted",
  "booking.decline": "Request declined",
  "booking.cancel": "Booking cancelled",
  "booking.done": "Marked done",
  "booking.no_show": "Marked no-show",
  "booking.undo": "Status undone",
  "booking.reschedule": "Booking moved",
  "booking.reassign": "Barber changed",
  "booking.service_change": "Service or price changed",
  "booking.update": "Booking edited",
  "booking.delete": "Booking deleted",
  // Clients
  "client.insert": "Client added",
  "client.update": "Client details edited",
  "client.delete": "Client deleted",
  // Team and accounts
  "staff.create": "Person added",
  "staff.update": "Profile edited",
  "staff.hours": "Working hours changed",
  "staff.role": "Role changed",
  "staff.switch_off": "Account switched off",
  "staff.switch_on": "Account switched on",
  "staff.delete": "Account deleted",
  "staff.service_add": "Service added to barber",
  "staff.service_remove": "Service removed from barber",
  "time_off.insert": "Time off added",
  "time_off.update": "Time off changed",
  "time_off.delete": "Time off removed",
  "account.password_reset": "Password reset",
  "account.password_change": "Password changed",
  "account.2fa_on": "Two-step sign-in turned on",
  "account.2fa_off": "Two-step sign-in turned off",
  "account.2fa_reset": "Two-step sign-in reset",
  // Services
  "service.create": "Service added",
  "service.update": "Service edited",
  "service.disable": "Service switched off",
  "service.enable": "Service switched on",
  "service.delete": "Service deleted",
  "service.reorder": "Services reordered",
  // Settings and closures
  "settings.update": "Settings changed",
  "closure.insert": "Closed day added",
  "closure.update": "Closed day changed",
  "closure.delete": "Closed day removed",
  // Website
  "photo.insert": "Photo added",
  "photo.update": "Photo edited",
  "photo.reorder": "Photos reordered",
  "photo.delete": "Photo deleted",
  "review.insert": "Review added",
  "review.update": "Review edited",
  "review.reorder": "Reviews reordered",
  "review.delete": "Review deleted",
  "website.shop_photo": "Shop photo changed",
  // Backups
  "backup.download": "Backup downloaded",
  "backup.restore": "Backup restored",
  "backup.undo_restore": "Restore undone",
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(/[._]/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/** Readable names for changed columns, per entity. */
export const COLUMN_LABELS: Record<string, Record<string, string>> = {
  booking: {
    starts_at: "time", ends_at: "end time", staff_id: "barber", service_id: "service", service_name: "service",
    price_pence: "price", duration_min: "length", status: "status", decline_reason: "decline reason",
    message_sent_at: "message sent", client_id: "client", booked_name: "name",
  },
  service: {
    name: "name", price_pence: "price", duration_min: "length", active: "on/off", sort: "order", bookable_days: "bookable days",
  },
  staff: {
    display_name: "name", title: "title", bio: "bio", photo_path: "photo", bookable: "takes bookings",
    show_on_site: "shown on website", weekly_hours: "working hours", active: "on/off", role: "role", sort: "order",
    username: "username", user_id: "login", deleted_at: "deleted",
  },
  settings: {
    shop_hours: "opening hours", min_notice_minutes: "minimum notice", booking_window_days: "how far ahead",
    due_back_weeks: "due-back weeks", max_open_requests: "waiting requests per phone",
    change_cutoff_minutes: "change/cancel cut-off", google_rating: "Google rating", google_review_count: "Google review count",
    google_review_url: "Google link", public_theme: "website theme", walk_in_text: "walk-in text",
    discount_text: "discount text", shop_photo_path: "shop photo",
  },
  client: { name: "name", phone: "phone number" },
  time_off: { starts_on: "start", ends_on: "end", reason: "reason" },
  closure: { closed_on: "date", reason: "reason" },
  photo: { alt: "description", visible: "shown/hidden", in_hero: "section", sort: "order", path: "file" },
  review: {
    author_name: "name", body: "text", stars: "stars", review_date: "date", is_google: "From Google", visible: "shown/hidden",
    sort: "order",
  },
};

/** "Changed price and length" */
export function describeChanged(entity: string, changed: string[] | null | undefined): string | null {
  if (!changed?.length) return null;
  const labels = [...new Set(changed.map((c) => COLUMN_LABELS[entity]?.[c] ?? c.replace(/_/g, " ")))];
  const list = labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
  return `Changed ${list}`;
}

export type ActivityType = "bookings" | "clients" | "team" | "services" | "settings" | "website";

export const ACTIVITY_TYPES: { value: ActivityType; label: string; prefixes: string[] }[] = [
  { value: "bookings", label: "Bookings", prefixes: ["booking."] },
  { value: "clients", label: "Clients", prefixes: ["client."] },
  { value: "team", label: "Team and accounts", prefixes: ["staff.", "time_off.", "account."] },
  { value: "services", label: "Services", prefixes: ["service."] },
  { value: "settings", label: "Settings and closures", prefixes: ["settings.", "closure.", "backup."] },
  { value: "website", label: "Website", prefixes: ["photo.", "review.", "website."] },
];

export function activityType(action: string): ActivityType | null {
  return ACTIVITY_TYPES.find((t) => t.prefixes.some((p) => action.startsWith(p)))?.value ?? null;
}

export const ACTIVITY_PAGE_SIZE = 50;

/** Newest first, grouped by London day. */
export function groupByDay<T extends { at: Date }>(entries: T[]): { date: DateKey; entries: T[] }[] {
  const groups: { date: DateKey; entries: T[] }[] = [];
  for (const e of [...entries].sort((a, b) => b.at.getTime() - a.at.getTime())) {
    const key = dateKey(e.at);
    const last = groups.at(-1);
    if (last?.date === key) last.entries.push(e);
    else groups.push({ date: key, entries: [e] });
  }
  return groups;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Filters and the "Show older" cursor, from the URL. Anything unrecognised is ignored. */
export type ActivityParams = { person: string | null; type: ActivityType | null; before: number | null };

export function parseActivityParams(search: Record<string, string | string[] | undefined>): ActivityParams {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const person = one(search.person);
  const type = one(search.type);
  const before = one(search.before);
  return {
    person: UUID.test(person) ? person.toLowerCase() : null,
    type: ACTIVITY_TYPES.some((t) => t.value === type) ? (type as ActivityType) : null,
    before: /^[1-9]\d{0,15}$/.test(before) ? Number(before) : null,
  };
}

export function activityHref(p: ActivityParams): string {
  const q = new URLSearchParams();
  if (p.person) q.set("person", p.person);
  if (p.type) q.set("type", p.type);
  if (p.before) q.set("before", String(p.before));
  const s = q.toString();
  return s ? `/dashboard/activity?${s}` : "/dashboard/activity";
}

/** PostgREST filter for a type: action starts with any of its prefixes. */
export function activityTypeFilter(type: ActivityType): string {
  const prefixes = ACTIVITY_TYPES.find((t) => t.value === type)!.prefixes;
  return prefixes.map((p) => `action.like.${p}*`).join(",");
}

/**
 * The line under an entry's label. Settings list what changed ("Changed opening hours"); plain edits add the
 * changed fields after the summary; everything else shows the summary as written by the database.
 */
export function entryDetail(e: { entity: string; action: string; summary: string | null; changed: string[] | null }): string | null {
  if (e.action === "settings.update") return describeChanged(e.entity, e.changed) ?? e.summary;
  const changed = e.action.endsWith(".update") ? describeChanged(e.entity, e.changed) : null;
  return [e.summary, changed].filter(Boolean).join(" · ") || null;
}
