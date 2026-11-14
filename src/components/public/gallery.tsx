"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Expand, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { lockScroll } from "@/lib/scroll-lock";
import type { SitePhoto } from "@/lib/site-content";

/**
 * Recent cuts (up to 4): a mosaic (first photo large on desktop); tapping one opens a native <dialog> lightbox with
 * previous/next (buttons, arrow keys, swipe), Esc to close, and focus back on the photo that opened it.
 */
export function Gallery({ photos }: { photos: SitePhoto[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const touchStart = useRef<number | null>(null);
  const [index, setIndex] = useState<number | null>(null);
  const count = photos.length;

  useEffect(() => {
    if (index === null) return;
    return lockScroll();
  }, [index]);

  if (count === 0) return null;

  const open = (i: number, button: HTMLButtonElement) => {
    opener.current = button;
    setIndex(i);
    dialog.current?.showModal();
  };
  const go = (delta: number) => setIndex((i) => (i === null ? i : (i + delta + count) % count));
  const current = index === null ? null : photos[index];

  return (
    <>
      <ul className="reveal grid grid-cols-2 gap-2 sm:gap-3 lg:auto-rows-[15rem] lg:grid-cols-4 xl:auto-rows-[17rem]">
        {photos.map((p, i) => {
          const big = i === 0 && count >= 3;
          const wide = i === 1 && count === 4;
          return (
            <li key={p.url} className={cn(big && "col-span-2 lg:row-span-2", wide && "lg:col-span-2")}>
              <button
                type="button"
                onClick={(e) => open(i, e.currentTarget)}
                className={cn(
                  "group relative block w-full overflow-hidden rounded-2xl bg-muted sm:rounded-3xl lg:aspect-auto lg:h-full",
                  big ? "aspect-[4/3]" : "aspect-[3/4]",
                )}
              >
                <Image
                  src={p.url}
                  alt={p.alt}
                  fill
                  sizes={big ? "(min-width: 1024px) 50vw, 100vw" : wide ? "(min-width: 1024px) 50vw, 50vw" : "(min-width: 1024px) 25vw, 50vw"}
                  className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.05] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                />
                <span
                  aria-hidden
                  className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                />
                <span
                  aria-hidden
                  className="absolute right-3 bottom-3 inline-flex size-10 translate-y-2 items-center justify-center rounded-full bg-white text-black opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100"
                >
                  <Expand className="size-4" />
                </span>
                <span className="sr-only">Open larger photo</span>
              </button>
            </li>
          );
        })}
      </ul>

      <dialog
        ref={dialog}
        aria-label="Photo viewer"
        onClose={() => {
          setIndex(null);
          opener.current?.focus();
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") go(1);
          if (e.key === "ArrowLeft") go(-1);
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) dialog.current?.close();
        }}
        className="m-auto h-dvh max-h-none w-full max-w-none bg-transparent p-0 text-white backdrop:bg-black/90 open:flex open:items-center open:justify-center"
      >
        {current && (
          <figure
            className="relative flex h-full w-full flex-col items-center justify-center px-4 pt-[max(4rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]"
            onTouchStart={(e) => (touchStart.current = e.touches[0].clientX)}
            onTouchEnd={(e) => {
              if (touchStart.current == null) return;
              const dx = e.changedTouches[0].clientX - touchStart.current;
              touchStart.current = null;
              if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
            }}
          >
            <div className="relative w-full max-w-3xl flex-1">
              <Image src={current.url} alt={current.alt} fill sizes="(min-width: 768px) 768px, 100vw" className="object-contain" />
            </div>
            <figcaption className="mt-4 text-center text-sm text-white/90">
              {current.alt} <span className="text-white/70">· {index! + 1} of {count}</span>
            </figcaption>
          </figure>
        )}
        <button
          type="button"
          onClick={() => dialog.current?.close()}
          autoFocus
          className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-3 inline-flex size-11 items-center justify-center rounded-full bg-white/15 hover:bg-white/25"
        >
          <X aria-hidden className="size-6" />
          <span className="sr-only">Close</span>
        </button>
        {count > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              className="absolute top-1/2 left-3 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 hover:bg-white/25"
            >
              <ChevronLeft aria-hidden className="size-6" />
              <span className="sr-only">Previous photo</span>
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              className="absolute top-1/2 right-3 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 hover:bg-white/25"
            >
              <ChevronRight aria-hidden className="size-6" />
              <span className="sr-only">Next photo</span>
            </button>
          </>
        )}
      </dialog>
    </>
  );
}
