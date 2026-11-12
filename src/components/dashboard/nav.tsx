"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Archive, CalendarDays, CircleUser, Ellipsis, Globe, History, type LucideIcon, Scissors, Settings, Sun, UserRound, Users,
} from "lucide-react";
import { isActive, type NavIcon, type NavItem } from "@/lib/dashboard/nav";
import { cn } from "@/lib/utils";

export const NAV_ICONS: Record<NavIcon, LucideIcon> = {
  today: Sun,
  calendar: CalendarDays,
  clients: Users,
  team: Scissors,
  more: Ellipsis,
  me: CircleUser,
  services: Scissors,
  website: Globe,
  settings: Settings,
  activity: History,
  account: UserRound,
  backup: Archive,
};

/** Desktop sidebar links. */
export function SideNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <ul className="space-y-1">
      {items.map((item) => {
        const Icon = NAV_ICONS[item.icon];
        const active = isActive(item, pathname);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex min-h-11 items-center gap-3 rounded-lg px-3 font-medium transition-colors hover:bg-sidebar-accent",
                active && "bg-sidebar-accent font-semibold",
              )}
            >
              {active ? <span aria-hidden className="absolute inset-y-2 left-0 w-1 rounded-full bg-primary" /> : null}
              <Icon aria-hidden className="size-5" />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** A text field has focus (the phone keyboard is probably up). */
function isTextField(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement) return !["checkbox", "radio", "button", "submit", "reset", "range", "file", "color"].includes(el.type);
  return el instanceof HTMLElement && el.isContentEditable;
}

/**
 * Phone bottom tab bar: safe-area aware; steps aside while a text field has focus so it never sits on top of
 * the keyboard or the field being typed in.
 */
export function TabBar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    const update = () => setTyping(isTextField(document.activeElement));
    // After focusout the next element isn't focused yet: check once focus has settled.
    const later = () => setTimeout(update, 0);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", later);
    return () => {
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", later);
    };
  }, []);

  return (
    <nav
      aria-label="Dashboard"
      data-typing={typing || undefined}
      inert={typing}
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-sidebar pb-[env(safe-area-inset-bottom)] text-sidebar-foreground transition-transform data-typing:translate-y-full lg:hidden"
    >
      <ul className="mx-auto grid max-w-xl" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((item) => {
          const Icon = NAV_ICONS[item.icon];
          const active = isActive(item, pathname);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-xs font-medium text-muted-foreground",
                  active && "font-semibold text-foreground",
                )}
              >
                {active ? <span aria-hidden className="absolute inset-x-4 top-0 h-1 rounded-b-full bg-primary" /> : null}
                <Icon aria-hidden className="size-6" />
                <span className="max-w-full truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
