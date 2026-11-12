"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { lockScroll } from "@/lib/scroll-lock";
import type { SitePhoto } from "@/lib/site-content";

/**
 * Recent cuts (up to 4): grid of photos; tapping one opens a native <dialog> lightbox with
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
      <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {photos.map((p, i) => (
          <li key={p.url}>
            <button
              type="button"
              onClick={(e) => open(i, e.currentTarget)}
              className="group relative block aspect-[3/4] w-full overflow-hidden rounded-xl border bg-muted"
            >
              <Image
                src={p.url}
                alt={p.alt}
                fill
                sizes="(min-width: 1152px) 260px, (min-width: 1024px) 23vw, (min-width: 640px) 45vw, 50vw"
                className="object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
              />
              <span className="sr-only">Open larger photo</span>
            </button>
          </li>
        ))}
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
