"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { NavLink } from "./nav";

type Box = { left: number; width: number };

/**
 * Desktop section links in a pill. A soft highlight glides to the link under the pointer, and a solid one marks
 * the section currently on screen (scroll-spy; aria-current="location"). Off the homepage nothing is marked.
 */
export function SectionNav({ links }: { links: NavLink[] }) {
  const list = useRef<HTMLUListElement>(null);
  const items = useRef<(HTMLAnchorElement | null)[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [boxes, setBoxes] = useState<Box[]>([]);

  const measure = useCallback(() => {
    setBoxes(items.current.map((a) => (a ? { left: a.offsetLeft, width: a.offsetWidth } : { left: 0, width: 0 })));
  }, []);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (list.current) ro.observe(list.current);
    document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, [measure, links]);

  // Scroll-spy: the section crossing a line ~35% down the screen is the current one.
  useEffect(() => {
    const sections = links.map((l) => document.getElementById(l.href.split("#")[1] ?? ""));
    if (sections.every((s) => !s)) return;
    const visible = new Set<number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const i = sections.indexOf(e.target as HTMLElement);
          if (e.isIntersecting) visible.add(i);
          else visible.delete(i);
        }
        setActive(visible.size ? Math.min(...visible) : null);
      },
      { rootMargin: "-35% 0px -64% 0px" },
    );
    sections.forEach((s) => s && observer.observe(s));
    return () => observer.disconnect();
  }, [links]);

  const pill = (i: number | null) => (i !== null && boxes[i] ? { transform: `translateX(${boxes[i].left}px)`, width: boxes[i].width } : undefined);

  return (
    <ul
      ref={list}
      onMouseLeave={() => setHover(null)}
      className="relative flex items-center rounded-full border border-border/70 bg-card/50 p-1 shadow-[inset_0_1px_0_color-mix(in_oklab,var(--foreground)_6%,transparent)]"
    >
      <span
        aria-hidden
        style={pill(hover)}
        className={cn(
          "absolute top-1 bottom-1 left-0 rounded-full bg-muted transition-[transform,width,opacity] duration-300 ease-out",
          hover === null || hover === active ? "opacity-0" : "opacity-100",
        )}
      />
      <span
        aria-hidden
        style={pill(active)}
        className={cn(
          "absolute top-1 bottom-1 left-0 rounded-full bg-foreground shadow-sm transition-[transform,width,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
          active === null ? "opacity-0" : "opacity-100",
        )}
      />
      {links.map((l, i) => (
        <li key={l.href}>
          <a
            ref={(el) => {
              items.current[i] = el;
            }}
            href={l.href}
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            aria-current={active === i ? "location" : undefined}
            className={cn(
              "relative inline-flex min-h-10 items-center rounded-full px-4 text-sm font-medium transition-colors duration-300",
              active === i ? "text-background" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {l.label}
          </a>
        </li>
      ))}
    </ul>
  );
}
