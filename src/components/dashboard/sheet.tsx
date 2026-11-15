"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { lockScroll } from "@/lib/scroll-lock";
import { cn } from "@/lib/utils";

/** Fired on window when any sheet closes (auto-refresh catches up then). */
export const SHEET_CLOSED_EVENT = "dashboard:sheet-closed";

/**
 * Dashboard sheet (spec §8.1): native modal <dialog>, so focus moves in, stays in, and returns; Esc closes.
 * A centred card on every screen, with even margins on phones (clear of the notch and home bar) and centred in the
 * space above the on-screen keyboard while typing.
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
    const dialog = ref.current;
    const lock = lockScroll();
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      lock();
    };
    releaseLock.current = release;
    // The dialog hides the moment it closes, but its "close" event only fires in a later task: watch the open
    // attribute so the page can scroll again straight away.
    const watcher = dialog ? new MutationObserver(() => !dialog.open && release()) : null;
    if (dialog) watcher?.observe(dialog, { attributes: true, attributeFilter: ["open"] });
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
      watcher?.disconnect();
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
        "fixed m-auto h-fit flex-col overflow-hidden rounded-[1.75rem] border bg-card p-0 text-card-foreground shadow-2xl",
        "backdrop:bg-black/60 backdrop:backdrop-blur-sm open:flex open:animate-in open:fade-in-0 open:zoom-in-95 open:duration-200 motion-reduce:open:animate-none",
        // Centred in the visible area: clear of the notch, the home bar and (iPhone) the keyboard.
        "inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] bottom-[calc(var(--keyboard-inset,0px)+max(0.75rem,env(safe-area-inset-bottom)))]",
        "w-[calc(100%-1.5rem)] max-w-lg",
        "max-h-[calc(100dvh-var(--keyboard-inset,0px)-max(0.75rem,env(safe-area-inset-top))-max(0.75rem,env(safe-area-inset-bottom)))] sm:max-h-[min(85dvh,48rem)] sm:w-[calc(100%-2rem)]",
        className,
      )}
    >
      <div className="flex shrink-0 items-start gap-3 border-b px-5 py-4 sm:px-6 sm:py-5">
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
          className="-mr-1.5 -mt-0.5 inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-border transition-colors hover:bg-muted"
        >
          <X aria-hidden className="size-5" />
          <span className="sr-only">Close</span>
        </button>
      </div>
      <div className="min-h-0 flex-[1_1_auto] overflow-y-auto overscroll-contain px-5 pt-5 after:block after:h-5 after:content-[''] sm:px-6">{children}</div>
      {footer ? (
        <div className="flex shrink-0 flex-wrap gap-3 border-t px-5 py-4 sm:px-6 [&>*]:flex-1">
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
    <div className="sticky bottom-0 z-10 -mx-5 -mb-5 mt-5 flex flex-wrap gap-3 border-t bg-card px-5 py-4 sm:-mx-6 sm:px-6 [&>*]:flex-1">
      {children}
    </div>
  );
}
