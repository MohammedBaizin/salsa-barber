"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { NavItem } from "@/lib/dashboard/nav";
import { NAV_ICONS } from "./nav";

export function MoreLinks({ items }: { items: NavItem[] }) {
  return (
    <ul className="mt-5 divide-y overflow-hidden rounded-xl border bg-card">
      {items.map((item) => {
        const Icon = NAV_ICONS[item.icon];
        return (
          <li key={item.href}>
            <Link href={item.href} className="flex min-h-14 items-center gap-3 px-4 font-medium hover:bg-muted">
              <Icon aria-hidden className="size-5 text-muted-foreground" />
              <span className="flex-1">{item.label}</span>
              <ChevronRight aria-hidden className="size-5 text-muted-foreground" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
