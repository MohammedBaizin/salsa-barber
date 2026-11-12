/**
 * Roles and permissions (spec §7): the pure rules the server checks before every action.
 * The database enforces the same rules with RLS and triggers.
 */
import { z } from "zod";
import { site } from "@/lib/site";

export type Role = "admin" | "owner" | "barber";
export type Person = { id: string; role: Role };

export const ROLE_LABELS: Record<Role, string> = { admin: "Admin", owner: "Owner", barber: "Barber" };

export const isManager = (p: Pick<Person, "role">) => p.role === "owner" || p.role === "admin";
export const isAdmin = (p: Pick<Person, "role">) => p.role === "admin";

/** Shop-wide permissions (no target person). */
export type Permission =
  | "bookings.view_all"
  | "bookings.reassign"
  | "bookings.change_service"
  | "clients.view_all"
  | "clients.edit"
  | "clients.delete"
  | "revenue.shop"
  | "team.manage"
  | "team.view_admins"
  | "team.create_owner_or_admin"
  | "hours.edit"
  | "services.edit"
  | "website.edit"
  | "settings.edit"
  | "activity.view"
  | "activity.view_admin_entries"
  | "backup";

const MANAGER: Permission[] = [
  "bookings.view_all", "bookings.reassign", "bookings.change_service", "clients.view_all", "clients.edit", "clients.delete",
  "revenue.shop", "team.manage", "hours.edit", "services.edit", "website.edit", "settings.edit", "activity.view",
];

/** Admins can do everything; owners everything in MANAGER; barbers none of these (their own work is checked per booking). */
export function can(actor: Pick<Person, "role">, permission: Permission): boolean {
  if (actor.role === "admin") return true;
  if (actor.role === "owner") return MANAGER.includes(permission);
  return false;
}

/** Roles the actor may give to a new account. */
export function creatableRoles(actor: Pick<Person, "role">): Role[] {
  if (actor.role === "admin") return ["barber", "owner", "admin"];
  if (actor.role === "owner") return ["barber"];
  return [];
}

/** Can the actor edit this person's profile, photo, services, hours and time off? */
export function canEditPerson(actor: Person, target: Person): boolean {
  if (actor.role === "admin") return true;
  if (actor.role === "owner") return target.role === "barber" || target.id === actor.id;
  return false;
}

/** Reset someone else's password: admin for anyone else, owner for barbers. */
export function canResetPassword(actor: Person, target: Person): boolean {
  if (actor.id === target.id) return false;
  if (actor.role === "admin") return true;
  return actor.role === "owner" && target.role === "barber";
}

/** Reset someone else's two-step sign-in: admin only. */
export function canReset2fa(actor: Person, target: Person): boolean {
  return actor.role === "admin" && actor.id !== target.id;
}

/** Switch off / on: never yourself. */
export function canSwitchOff(actor: Person, target: Person): boolean {
  if (actor.id === target.id) return false;
  if (actor.role === "admin") return true;
  return actor.role === "owner" && target.role === "barber";
}

/** Delete an account: never yourself, never with upcoming bookings; owner only for barbers. */
export function canDelete(actor: Person, target: Person, upcomingBookings: number): boolean {
  return upcomingBookings === 0 && canSwitchOff(actor, target);
}

/** Change a role: admin only, never their own. */
export function canChangeRole(actor: Person, target: Person): boolean {
  return actor.role === "admin" && actor.id !== target.id;
}

/** Admin rows are only visible to admins. */
export function visibleToActor(actor: Pick<Person, "role">, target: Pick<Person, "role">): boolean {
  return target.role !== "admin" || actor.role === "admin";
}

// ---------------------------------------------------------------------------
// Usernames and display
// ---------------------------------------------------------------------------

export const USERNAME_RULE = "3–30 characters: lowercase letters, numbers, dots, dashes or underscores.";

/** Case-insensitive usernames: stored lowercase. Mirrors the staff.username check. */
export const usernameSchema = z
  .string()
  .transform((v) => v.trim().toLowerCase())
  .pipe(z.string().regex(/^[a-z0-9._-]{3,30}$/, USERNAME_RULE));

/** username -> internal login email (never receives mail). */
export function loginEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${site.staffEmailDomain}`;
}

/** "SAMPLE Sam Smith" -> "SS"; one word -> first letter. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const letters = words.length === 1 ? [words[0][0]] : [words[0][0], words.at(-1)![0]];
  return letters.join("").toUpperCase();
}

export const profileSchema = z.object({
  displayName: z.string().transform((v) => v.replace(/\s+/g, " ").trim()).pipe(z.string().min(1, "Please enter a name.").max(60)),
  title: z.string().trim().max(60).optional().default(""),
  bio: z.string().trim().max(600, "Please keep the bio to 600 characters.").optional().default(""),
  bookable: z.boolean(),
  showOnSite: z.boolean(),
});
