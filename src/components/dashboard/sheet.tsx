"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { lockScroll } from "@/lib/scroll-lock";
import { cn } from "@/lib/utils";

/** Fired on window when any sheet closes (auto-refresh catches up then). */
export const SHEET_CLOSED_EVENT = "dashboard:sheet-closed";

/**
 * Dashboard sheet (spec §8.1): native modal <dialog>, so focus moves in, stays in, and returns; Esc closes.
 * Phone: bottom sheet that stays above the on-screen keyboard. Desktop: centred panel.
 * Sticky title, scrolling body (flex: 1 1 auto, iOS Safari collapses flex-basis 0), pinned footer buttons.
 * Page scroll is locked without jumping.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  footer,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  /** Releases the page scroll lock; called as soon as the dialog closes (not a render later). */
  const releaseLock = useRef<(() => void) | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // When the page is left (or kept hidden by the router for Back), an open modal dialog would leave the next page
  // inert: close it.
  useEffect(() => {
    const dialog = ref.current;
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const lock = lockScroll();
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      lock();
    };
    releaseLock.current = release;
    const dialog = ref.current;
    const viewport = window.visualViewport;
    // Keep the sheet above the iPhone keyboard (Android resizes the page via interactive-widget).
    const place = () => {
      if (!dialog || !viewport) return;
      const covered = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      dialog.style.setProperty("--keyboard-inset", `${covered}px`);
    };
    place();
    viewport?.addEventListener("resize", place);
    viewport?.addEventListener("scroll", place);
    return () => {
      viewport?.removeEventListener("resize", place);
      viewport?.removeEventListener("scroll", place);
      release();
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={() => {
        releaseLock.current?.();
        onClose();
        window.dispatchEvent(new Event(SHEET_CLOSED_EVENT));
      }}
      onClick={(event) => {
        // A tap on the backdrop (outside the panel) closes the sheet.
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      className={cn(
        "fixed m-0 flex-col overflow-hidden border bg-card p-0 text-card-foreground shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm open:flex open:animate-in open:fade-in open:slide-in-from-bottom-6 open:duration-300 sm:open:zoom-in-95 sm:open:slide-in-from-bottom-0",
        // Phone: bottom sheet above the keyboard.
        "inset-x-0 top-auto bottom-[var(--keyboard-inset,0px)] w-full max-w-none rounded-t-3xl border-b-0",
        "max-h-[calc(100dvh-var(--keyboard-inset,0px)-max(1rem,env(safe-area-inset-top)))]",
        // Desktop: centred panel.
        "sm:inset-0 sm:m-auto sm:h-fit sm:max-h-[min(85dvh,48rem)] sm:w-[calc(100%-2rem)] sm:max-w-lg sm:rounded-3xl sm:border-b",
        className,
      )}
    >
      <div className="flex shrink-0 items-start gap-3 border-b px-4 pt-3 pb-3 sm:px-6 sm:pt-5">
        <div className="min-w-0 flex-1 pt-1.5">
          <h2 id={titleId} className="font-heading text-xl font-bold tracking-tight">
            {title}
          </h2>
          {description ? (
            <p id={descriptionId} className="mt-1 text-sm text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => ref.current?.close()}
          className="-mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-border transition-colors hover:bg-muted"
        >
          <X aria-hidden className="size-5" />
          <span className="sr-only">Close</span>
        </button>
      </div>
      <div className="min-h-0 flex-[1_1_auto] overflow-y-auto overscroll-contain px-4 pt-4 after:block after:h-4 after:content-[''] sm:px-6">{children}</div>
      {footer ? (
        <div className="flex shrink-0 flex-wrap gap-3 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-5 [&>*]:flex-1">
          {footer}
        </div>
      ) : null}
    </dialog>
  );
}

/**
 * Primary buttons of a sheet's form: pinned to the bottom of the scrolling body (above the keyboard on phones),
 * inside the <form> so Enter and the submit button work normally.
 */
export function SheetActions({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-5 flex flex-wrap gap-3 border-t bg-card px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:-mx-6 sm:px-6 [&>*]:flex-1">
      {children}
    </div>
  );
}
