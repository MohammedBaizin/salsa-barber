"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { NavItem } from "@/lib/dashboard/nav";
import { NAV_ICONS } from "./nav";

/** One line under each tile on the More page. */
const DESCRIPTIONS: Record<string, string> = {
  "/dashboard/services": "Prices, lengths and who does what",
  "/dashboard/website": "Photos, team cards and reviews",
  "/dashboard/settings": "Online booking, hours and closed days",
  "/dashboard/activity": "Who changed what, and when",
  "/dashboard/account": "Password, two-step sign-in, theme",
  "/dashboard/backup": "Download or restore the shop's data",
};

export function MoreLinks({ items }: { items: NavItem[] }) {
  return (
    <ul className="mt-6 grid gap-3 sm:grid-cols-2">
      {items.map((item) => {
        const Icon = NAV_ICONS[item.icon];
        return (
          <li
            key={item.href}
            className="group relative flex h-full min-h-24 items-start gap-4 rounded-3xl border bg-card p-5 shadow-[var(--shadow-soft)] transition-all duration-200 has-[a:hover]:-translate-y-0.5 has-[a:hover]:border-primary/60 has-[a:focus-visible]:outline-3 has-[a:focus-visible]:outline-ring"
          >
            <span aria-hidden className="inline-flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-link">
              <Icon className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <Link
                href={item.href}
                className="block font-heading text-lg font-bold tracking-tight outline-none after:absolute after:inset-0 after:rounded-3xl after:content-['']"
              >
                {item.label}
              </Link>
              {DESCRIPTIONS[item.href] ? <span className="mt-0.5 block text-sm text-muted-foreground">{DESCRIPTIONS[item.href]}</span> : null}
            </span>
            <ArrowUpRight aria-hidden className="size-5 shrink-0 text-muted-foreground transition-transform group-has-[a:hover]:translate-x-0.5 group-has-[a:hover]:-translate-y-0.5" />
          </li>
        );
      })}
    </ul>
  );
}
