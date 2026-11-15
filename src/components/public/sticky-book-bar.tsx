"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { BookCallButtons } from "./book-call-buttons";

/**
 * Phone-only Book bar: a dark floating pill with the same Book + Call buttons as the hero. Hidden (inert, slid
 * off-screen) while the hero's Book button is visible, so only one Book button shows at a time.
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
        "dark fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 rounded-full border border-white/10 bg-background/80 p-1.5 text-foreground shadow-[0_18px_50px_-12px_rgba(0,0,0,0.6)] backdrop-blur-xl backdrop-saturate-150 transition-transform duration-300 motion-reduce:transition-none md:hidden",
        heroVisible ? "translate-y-[calc(100%+2rem)]" : "translate-y-0",
      )}
    >
      <BookCallButtons compact />
    </div>
  );
}
