"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import type { SitePhoto } from "@/lib/site-content";
import { cn } from "@/lib/utils";

const INTERVAL_MS = 6000;
/** Slide width as a share of the track, and the gap between slides. */
const SLIDE = "var(--slide-w)";
const GAP = "0.75rem";

function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * "Inside the shop" carousel (up to 3 photos): a compact centred slide with its neighbours peeking in at the
 * sides (tap one to move to it). Autoplays with progress pills, prev / pause / next, swipe on phones, pauses while
 * hovered or focused. With reduced motion it never autoplays and slides without animation.
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
      className="relative mx-auto max-w-4xl"
    >
      <div
        className="relative overflow-hidden [--slide-w:84%] sm:[--slide-w:70%] [mask-image:linear-gradient(90deg,transparent,black_6%,black_94%,transparent)]"
        onTouchStart={(e) => (touchStart.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchStart.current == null) return;
          const dx = e.changedTouches[0].clientX - touchStart.current;
          touchStart.current = null;
          if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
        }}
      >
        <div
          className="flex transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
          style={{ gap: GAP, transform: `translateX(calc(50% - ${SLIDE} / 2 - ${index} * (${SLIDE} + ${GAP})))` }}
        >
          {photos.map((p, i) => {
            const active = i === index;
            return (
              <div
                key={p.url}
                role="group"
                aria-roledescription="slide"
                aria-label={`${i + 1} of ${count}`}
                aria-hidden={!active}
                onClick={active ? undefined : () => setIndex(i)}
                className={cn(
                  "relative aspect-[4/5] w-[var(--slide-w)] shrink-0 overflow-hidden rounded-3xl bg-muted transition-[opacity,scale] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none sm:aspect-[16/10]",
                  active ? "scale-100 opacity-100" : "scale-[0.9] cursor-pointer opacity-45",
                )}
              >
                <Image
                  src={p.url}
                  alt={p.alt}
                  fill
                  sizes="(min-width: 1024px) 630px, (min-width: 640px) 70vw, 84vw"
                  className="object-cover object-[50%_35%]"
                />
                {active && (
                  <span className="glass absolute bottom-3 left-3 inline-flex items-center rounded-full border border-white/15 px-3 py-1 text-xs font-semibold text-foreground">
                    {i + 1} / {count}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {count > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => go(-1)}
            className="inline-flex size-11 items-center justify-center rounded-full border border-border bg-card transition-colors hover:border-foreground"
          >
            <ChevronLeft aria-hidden className="size-5" />
            <span className="sr-only">Previous photo</span>
          </button>

          <div className="mx-2 flex items-center gap-1.5" aria-hidden>
            {photos.map((p, i) => (
              <span
                key={p.url}
                className={cn(
                  "relative h-1.5 overflow-hidden rounded-full bg-border transition-[width] duration-500",
                  i === index ? "w-10" : "w-1.5",
                )}
              >
                <span
                  className={cn(
                    "absolute inset-y-0 left-0 bg-primary",
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

          <button
            type="button"
            onClick={() => setUserPaused((p) => !p)}
            className="inline-flex size-11 items-center justify-center rounded-full border border-border bg-card transition-colors hover:border-foreground"
            disabled={reduced}
          >
            {userPaused || reduced ? <Play aria-hidden className="size-4" /> : <Pause aria-hidden className="size-4" />}
            <span className="sr-only">{userPaused || reduced ? "Play slideshow" : "Pause slideshow"}</span>
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            className="inline-flex size-11 items-center justify-center rounded-full border border-border bg-card transition-colors hover:border-foreground"
          >
            <ChevronRight aria-hidden className="size-5" />
            <span className="sr-only">Next photo</span>
          </button>
          <p className="sr-only" aria-live="polite">
            Photo {index + 1} of {count}: {photos[index].alt}
          </p>
        </div>
      )}
    </div>
  );
}
