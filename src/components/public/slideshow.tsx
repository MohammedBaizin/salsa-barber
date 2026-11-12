"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import type { SitePhoto } from "@/lib/site-content";
import { cn } from "@/lib/utils";

const INTERVAL_MS = 6000;

function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * "Inside the shop" slideshow (up to 3 photos). Autoplays with a progress track, prev / pause / next,
 * swipe on phones, pauses while hovered or focused. With reduced motion it never autoplays.
 */
export function Slideshow({ photos }: { photos: SitePhoto[] }) {
  const [index, setIndex] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const reduced = useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => true);
  const touchStart = useRef<number | null>(null);
  const count = photos.length;

  const go = useCallback((delta: number) => setIndex((i) => (i + delta + count) % count), [count]);
  const playing = count > 1 && !reduced && !userPaused && !hovered && !focused;

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => go(1), INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [playing, index, go]);

  if (count === 0) return null;

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="Photos of the shop"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
      className="relative"
    >
      <div
        className="relative aspect-[4/5] overflow-hidden rounded-2xl border bg-muted sm:aspect-[3/2] lg:aspect-[16/9]"
        onTouchStart={(e) => (touchStart.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchStart.current == null) return;
          const dx = e.changedTouches[0].clientX - touchStart.current;
          touchStart.current = null;
          if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
        }}
      >
        {photos.map((p, i) => (
          <div
            key={p.url}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${count}`}
            aria-hidden={i !== index}
            className={cn(
              "absolute inset-0 transition-opacity duration-700 motion-reduce:transition-none",
              i === index ? "opacity-100" : "pointer-events-none opacity-0",
            )}
          >
            <Image src={p.url} alt={p.alt} fill sizes="(min-width: 1152px) 1088px, calc(100vw - 2rem)" className="object-cover object-[50%_35%]" />
          </div>
        ))}
      </div>

      {count > 1 && (
        <div className="mt-4 flex items-center gap-3">
          <button type="button" onClick={() => go(-1)} className="inline-flex size-11 items-center justify-center rounded-full border bg-card hover:bg-muted">
            <ChevronLeft aria-hidden className="size-5" />
            <span className="sr-only">Previous photo</span>
          </button>
          <button
            type="button"
            onClick={() => setUserPaused((p) => !p)}
            className="inline-flex size-11 items-center justify-center rounded-full border bg-card hover:bg-muted"
            disabled={reduced}
          >
            {userPaused || reduced ? <Play aria-hidden className="size-5" /> : <Pause aria-hidden className="size-5" />}
            <span className="sr-only">{userPaused || reduced ? "Play slideshow" : "Pause slideshow"}</span>
          </button>
          <button type="button" onClick={() => go(1)} className="inline-flex size-11 items-center justify-center rounded-full border bg-card hover:bg-muted">
            <ChevronRight aria-hidden className="size-5" />
            <span className="sr-only">Next photo</span>
          </button>

          <div className="ml-2 flex flex-1 gap-2" aria-hidden>
            {photos.map((p, i) => (
              <span key={p.url} className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-border">
                <span
                  className={cn(
                    "pole-stripe absolute inset-y-0 left-0",
                    i < index && "w-full",
                    i > index && "w-0",
                    i === index && (playing ? "w-0 animate-[slide-progress_linear_forwards]" : "w-full"),
                  )}
                  style={i === index && playing ? { animationDuration: `${INTERVAL_MS}ms` } : undefined}
                  key={i === index ? `${index}-${playing}` : undefined}
                />
              </span>
            ))}
          </div>
          <p className="sr-only" aria-live="polite">
            Photo {index + 1} of {count}: {photos[index].alt}
          </p>
        </div>
      )}
    </div>
  );
}
