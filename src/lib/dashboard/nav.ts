/**
 * Dashboard navigation (spec §8.1). Pure, so it can be unit-tested and passed from server to client components
 * (icons are names; the client component maps them to Lucide icons).
 *
 * Owner/Admin tabs: Today · Calendar · Clients · Team · More
 * Barber tabs:      Today · Calendar · Clients · Me
 */
import type { Role } from "@/lib/domain/team";

export type NavIcon =
  | "today"
  | "calendar"
  | "clients"
  | "team"
  | "more"
  | "me"
  | "services"
  | "website"
  | "settings"
  | "activity"
  | "account"
  | "backup";

export type NavItem = {
  href: string;
  label: string;
  icon: NavIcon;
  /** Other paths that light up this item (e.g. More for its sub-pages). */
  also?: string[];
};

const MORE_ITEMS = {
  services: { href: "/dashboard/services", label: "Services and prices", icon: "services" },
  website: { href: "/dashboard/website", label: "Website", icon: "website" },
  settings: { href: "/dashboard/settings", label: "Settings", icon: "settings" },
  activity: { href: "/dashboard/activity", label: "Activity", icon: "activity" },
  account: { href: "/dashboard/account", label: "Account", icon: "account" },
  backup: { href: "/dashboard/backup", label: "Backup", icon: "backup" },
} satisfies Record<string, NavItem>;

/** Pages listed on the More page (owner/admin). Backup is admin only. */
export function moreItems(role: Role): NavItem[] {
  const items: NavItem[] = [MORE_ITEMS.services, MORE_ITEMS.website, MORE_ITEMS.settings, MORE_ITEMS.activity, MORE_ITEMS.account];
  if (role === "admin") items.push(MORE_ITEMS.backup);
  return items;
}

/** Bottom tabs on phones and the sidebar on desktop (same items). */
export function navItems(role: Role): NavItem[] {
  const common: NavItem[] = [
    { href: "/dashboard", label: "Today", icon: "today" },
    { href: "/dashboard/calendar", label: "Calendar", icon: "calendar" },
    { href: "/dashboard/clients", label: "Clients", icon: "clients" },
  ];
  if (role === "barber") {
    // Me = Account + own hours/time off + read-only Services.
    return [...common, { href: "/dashboard/account", label: "Me", icon: "me", also: ["/dashboard/services"] }];
  }
  return [
    ...common,
    { href: "/dashboard/team", label: "Team", icon: "team" },
    { href: "/dashboard/more", label: "More", icon: "more", also: moreItems(role).map((i) => i.href) },
  ];
}

/** Whether a nav item is the current page. Today matches only /dashboard itself. */
export function isActive(item: NavItem, pathname: string): boolean {
  const matches = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname === href || pathname.startsWith(`${href}/`);
  return matches(item.href) || (item.also ?? []).some(matches);
}
