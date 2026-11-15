"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Pause, Play, Star } from "lucide-react";
import { site } from "@/lib/site";
import type { SitePhoto } from "@/lib/site-content";
import { cn } from "@/lib/utils";

const INTERVAL_MS = 6000;
/** Slide width as a share of the track, and the gap between slides. */
const SLIDE = "var(--slide-w)";
const GAP = "0.75rem";
/** Lines an overlay up with the active slide's left / right edge (the track is centred on it). */
const SLIDE_INSET = "calc((100% - var(--slide-w)) / 2 + 0.75rem)";

function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const dockButton =
  "inline-flex size-10 shrink-0 items-center justify-center rounded-full text-foreground transition-[background-color,scale] hover:bg-muted active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-40";
const sideButton =
  "dark glass absolute top-1/2 z-10 hidden size-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 text-foreground shadow-[0_10px_30px_rgba(0,0,0,0.35)] transition-[background-color,scale,opacity] hover:scale-105 hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:inline-flex";

type Rating = { googleRating: number | null; googleReviewCount: number | null; googleReviewUrl: string | null };

/**
 * "Inside the shop" carousel (up to 3 photos). Above it: the shop's badge and name with a 01 / 03 counter. A centred
 * slide with its neighbours peeking in at the sides (tap one to move to it); each photo is shown whole over a
 * blurred copy of itself. On the photo: the Google rating (top) and a small caption (bottom). Floating glass arrows
 * sit on the photo's edges on desktop, and a control dock (prev · progress · pause · next) overlaps its bottom edge.
 * Autoplays, swipes on phones, pauses while hovered or focused. With reduced motion it never autoplays and slides
 * without animation.
 */
export function Slideshow({ photos, googleRating, googleReviewCount, googleReviewUrl }: { photos: SitePhoto[] } & Partial<Rating>) {
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
  const current = photos[index];

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
      className="relative mx-auto max-w-4xl [--slide-w:88%] sm:[--slide-w:76%]"
    >
      {/* Shop name above the photo. */}
      <div className="mx-auto mb-4 flex w-full items-center justify-between gap-3 sm:w-(--slide-w)">
        <div className="flex min-w-0 items-center gap-3">
          <Image src="/brand/badge-disc-160.webp" alt="" width={44} height={44} className="size-11 shrink-0 drop-shadow-[0_6px_16px_rgba(255,194,14,0.3)]" />
          <div className="min-w-0">
            <p className="truncate font-heading text-lg leading-tight font-extrabold tracking-tight sm:text-xl">{site.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {site.address.street}, {site.address.area}
            </p>
          </div>
        </div>
        <p aria-hidden className="shrink-0 font-heading text-sm font-bold tabular-nums">
          {String(index + 1).padStart(2, "0")}
          <span className="text-muted-foreground"> / {String(count).padStart(2, "0")}</span>
        </p>
      </div>

      <div
        className="relative -mx-4 overflow-hidden sm:mx-0"
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
                  "relative isolate aspect-square w-(--slide-w) shrink-0 overflow-hidden rounded-[1.75rem] bg-muted shadow-[0_24px_60px_-20px_rgba(0,0,0,0.45)] ring-1 ring-black/5 transition-[opacity,scale,filter] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none sm:aspect-3/2",
                  active ? "scale-100 opacity-100" : "scale-[0.9] cursor-pointer opacity-40 saturate-50",
                )}
              >
                {/* Blurred fill so the whole photo can show without letterbox bars. */}
                <Image src={p.url} alt="" aria-hidden fill sizes="64px" quality={70} className="-z-10 scale-125 object-cover blur-xl brightness-75" />
                <Image
                  src={p.url}
                  alt={p.alt}
                  fill
                  sizes="(min-width: 1024px) 690px, (min-width: 640px) 76vw, 88vw"
                  quality={80}
                  className="object-contain"
                />
                {/* Caption on the photo, small, over a soft fade. The alt text already describes it to screen readers. */}
                <div
                  aria-hidden
                  className={cn(
                    "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-4 pt-14 pb-10 transition-opacity duration-500 sm:px-6 sm:pb-11",
                    active ? "opacity-100" : "opacity-0",
                  )}
                >
                  <p className="line-clamp-1 text-center text-xs font-medium text-white/90 sm:text-[0.8125rem]">{p.alt}</p>
                </div>
              </div>
            );
          })}
        </div>

        {googleRating != null && (
          <RatingBadge
            rating={googleRating}
            count={googleReviewCount ?? null}
            url={googleReviewUrl ?? null}
            style={{ left: SLIDE_INSET }}
            className="absolute top-3 sm:top-4"
          />
        )}

        {count > 1 && (
          <>
            <button type="button" tabIndex={-1} aria-hidden onClick={() => go(-1)} style={{ left: SLIDE_INSET }} className={sideButton}>
              <ChevronLeft className="size-5" />
            </button>
            <button type="button" tabIndex={-1} aria-hidden onClick={() => go(1)} style={{ right: SLIDE_INSET }} className={sideButton}>
              <ChevronRight className="size-5" />
            </button>
          </>
        )}
      </div>

      {/* Control dock, overlapping the photo's bottom edge. */}
      {count > 1 && (
        <div className="relative z-10 -mt-6 flex justify-center">
          <div className="flex items-center gap-1 rounded-full border border-border bg-background/85 p-1 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.35)] backdrop-blur-xl backdrop-saturate-150">
            <button type="button" onClick={() => go(-1)} className={dockButton}>
              <ChevronLeft aria-hidden className="size-5" />
              <span className="sr-only">Previous photo</span>
            </button>

            <div className="flex items-center gap-1.5 px-2" aria-hidden>
              {photos.map((p, i) => (
                <span
                  key={p.url}
                  onClick={() => setIndex(i)}
                  className={cn(
                    "relative h-1.5 cursor-pointer overflow-hidden rounded-full bg-border transition-[width] duration-500",
                    i === index ? "w-10" : "w-3 hover:bg-muted-foreground/50",
                  )}
                >
                  <span
                    className={cn(
                      "absolute inset-y-0 left-0 rounded-full bg-primary",
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

            <button type="button" onClick={() => setUserPaused((p) => !p)} disabled={reduced} className={dockButton}>
              {userPaused || reduced ? <Play aria-hidden className="size-4 fill-current" /> : <Pause aria-hidden className="size-4 fill-current" />}
              <span className="sr-only">{userPaused || reduced ? "Play slideshow" : "Pause slideshow"}</span>
            </button>
            <button type="button" onClick={() => go(1)} className={dockButton}>
              <ChevronRight aria-hidden className="size-5" />
              <span className="sr-only">Next photo</span>
            </button>
          </div>
        </div>
      )}

      <p className="sr-only" aria-live="polite">
        Photo {index + 1} of {count}: {current.alt}
      </p>
    </div>
  );
}

/** Google rating on the photo: score tile, five stars and the review count, in a dark glass card. */
function RatingBadge({
  rating,
  count,
  url,
  className,
  style,
}: {
  rating: number;
  count: number | null;
  url: string | null;
  className?: string;
  style?: React.CSSProperties;
}) {
  const filled = Math.round(rating);
  const body = (
    <>
      <span aria-hidden className="flex size-9 items-center justify-center rounded-xl bg-primary font-heading text-base font-extrabold text-primary-foreground tabular-nums">
        {rating.toFixed(1)}
      </span>
      <span className="flex flex-col gap-1">
        <span aria-hidden className="flex gap-0.5">
          {Array.from({ length: 5 }, (_, i) => (
            <Star key={i} className={cn("size-3", i < filled ? "fill-highlight text-highlight" : "text-white/35")} />
          ))}
        </span>
        <span className="text-[0.6875rem] leading-none font-medium text-white/85">
          <span className="sr-only">{rating.toFixed(1)} out of 5 </span>on Google{count != null && ` · ${count} reviews`}
        </span>
      </span>
    </>
  );
  const cls = cn(
    "dark glass z-10 flex items-center gap-2.5 rounded-2xl border border-white/15 py-1.5 pr-3.5 pl-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.35)]",
    className,
  );
  return url ? (
    <a href={url} target="_blank" rel="noopener noreferrer" style={style} className={cn(cls, "transition-colors hover:bg-white/15")}>
      {body}
    </a>
  ) : (
    <p style={style} className={cls}>
      {body}
    </p>
  );
}
