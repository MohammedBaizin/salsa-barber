"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Phone } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * Phone-only Book bar. Hidden (inert, slid off-screen) while the hero's Book button is visible,
 * so only one Book button shows at a time.
 */
export function StickyBookBar({ watchId = "hero-book" }: { watchId?: string }) {
  const [heroVisible, setHeroVisible] = useState(true);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = document.getElementById(watchId);
    if (!target) return;
    const observer = new IntersectionObserver(([entry]) => setHeroVisible(entry.isIntersecting), { rootMargin: "-64px 0px 0px 0px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [watchId]);

  useEffect(() => {
    if (bar.current) bar.current.inert = heroVisible;
  }, [heroVisible]);

  return (
    <div
      ref={bar}
      data-testid="sticky-book-bar"
      data-visible={!heroVisible}
      aria-hidden={heroVisible}
      className={cn(
        "fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 rounded-full border border-border/70 p-1.5 shadow-[var(--shadow-soft)] glass transition-transform duration-300 motion-reduce:transition-none md:hidden",
        heroVisible ? "translate-y-[calc(100%+2rem)]" : "translate-y-0",
      )}
    >
      <div className="grid grid-cols-[1fr_auto] gap-1.5">
        <Link href="/book" className={cn(buttonVariants({ variant: "pop" }))}>
          Book a cut
        </Link>
        <a href={`tel:${site.phone.e164}`} className={cn(buttonVariants({ variant: "outline" }))}>
          <Phone aria-hidden />
          Call
        </a>
      </div>
    </div>
  );
}
