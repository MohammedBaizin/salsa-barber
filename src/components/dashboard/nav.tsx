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

/** Desktop sidebar links (the sidebar is always dark). The active link is a lifted card with a yellow icon. */
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
                "group relative flex min-h-11 items-center gap-3 rounded-2xl px-3 text-[0.9375rem] font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground",
                active && "bg-card font-semibold text-foreground shadow-[inset_0_1px_0_color-mix(in_oklab,var(--foreground)_8%,transparent)]",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "inline-flex size-8 items-center justify-center rounded-xl transition-colors",
                  active ? "bg-primary text-primary-foreground shadow-pop-sm" : "bg-muted/60 group-hover:bg-muted",
                )}
              >
                <Icon className="size-4" />
              </span>
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
      className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 transition-transform duration-300 data-typing:translate-y-[calc(100%+2rem)] lg:hidden"
    >
      <ul
        className="mx-auto grid max-w-xl gap-1 rounded-full border border-border/80 bg-card p-1.5 shadow-[var(--shadow-soft)]"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((item) => {
          const Icon = NAV_ICONS[item.icon];
          const active = isActive(item, pathname);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-13 flex-col items-center justify-center gap-0.5 rounded-full px-1 text-[0.6875rem] font-semibold text-muted-foreground transition-colors",
                  active ? "bg-foreground text-background" : "hover:text-foreground",
                )}
              >
                <Icon aria-hidden className="size-5" />
                <span className="max-w-full truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
