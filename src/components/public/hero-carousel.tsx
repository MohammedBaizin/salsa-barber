"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import type { SitePhoto } from "@/lib/site-content";
import { cn } from "@/lib/utils";

const INTERVAL_MS = 5000;

function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The hero's photo panel: the photos cross-fade (with a slow zoom) every few seconds, swipe on phones, and pause while
 * hovered or focused. A small glass pill of progress bars (top right) shows which photo is on and jumps to one when
 * tapped. `overlay` is laid over every photo (rating, open status, address). With one photo it is just that photo.
 * With reduced motion it never autoplays and switches without animation.
 */
export function HeroCarousel({ photos, overlay, className }: { photos: SitePhoto[]; overlay?: React.ReactNode; className?: string }) {
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const reduced = useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => true);
  const touchStart = useRef<number | null>(null);
  const count = photos.length;
  const playing = count > 1 && !reduced && !hovered && !focused;

  const go = useCallback((delta: number) => setIndex((i) => (i + delta + count) % count), [count]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => go(1), INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [playing, index, go]);

  if (count === 0) return null;

  return (
    <figure
      role={count > 1 ? "region" : undefined}
      aria-roledescription={count > 1 ? "carousel" : undefined}
      aria-label={count > 1 ? "Shopfront and inside photos" : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
      onTouchStart={(e) => (touchStart.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchStart.current == null) return;
        const dx = e.changedTouches[0].clientX - touchStart.current;
        touchStart.current = null;
        if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
      }}
      className={cn("relative isolate overflow-hidden bg-muted", className)}
    >
      <div className="relative aspect-4/3 lg:aspect-5/4">
        {photos.map((p, i) => {
          const active = i === index;
          return (
            <div
              key={p.url}
              aria-hidden={!active}
              className={cn(
                "absolute inset-0 transition-opacity duration-1000 ease-out motion-reduce:transition-none",
                active ? "opacity-100" : "opacity-0",
              )}
            >
              <Image
                src={p.url}
                alt={p.alt}
                fill
                preload={i === 0}
                quality={80}
                sizes="(min-width: 1024px) 55vw, 100vw"
                className={cn(
                  "object-cover transition-transform duration-[6s] ease-out motion-reduce:transition-none",
                  active ? "scale-[1.04]" : "scale-100",
                )}
              />
            </div>
          );
        })}
      </div>

      {/* Soft fades top and bottom so the small labels stay readable on any photo. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.45),transparent_26%,transparent_66%,rgba(0,0,0,0.6))]" />
      {overlay}

      {count > 1 && (
        <div className="glass absolute top-3 right-3 flex h-7 items-center gap-1 rounded-full border border-white/15 px-1.5 sm:top-4 sm:right-4">
          {photos.map((p, i) => (
            <button
              key={p.url}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Show photo ${i + 1} of ${count}`}
              aria-current={i === index}
              className="flex h-full items-center px-0.5 outline-none focus-visible:outline-2 focus-visible:outline-primary"
            >
              <span className={cn("relative block h-1 overflow-hidden rounded-full bg-white/30 transition-[width] duration-500", i === index ? "w-7" : "w-3")}>
                <span
                  key={i === index ? `${index}-${playing}` : undefined}
                  className={cn(
                    "absolute inset-y-0 left-0 rounded-full bg-primary",
                    i !== index && "w-0",
                    i === index && (playing ? "w-0 animate-[slide-progress_linear_forwards]" : "w-full"),
                  )}
                  style={i === index && playing ? { animationDuration: `${INTERVAL_MS}ms` } : undefined}
                />
              </span>
            </button>
          ))}
        </div>
      )}

      {count > 1 && (
        <p className="sr-only" aria-live="polite">
          Photo {index + 1} of {count}: {photos[index].alt}
        </p>
      )}
    </figure>
  );
}
