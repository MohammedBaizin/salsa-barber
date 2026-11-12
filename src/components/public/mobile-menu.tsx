"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MapPin, Menu, Phone, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { lockScroll } from "@/lib/scroll-lock";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";
import type { NavLink } from "./nav";

/**
 * Phone menu: full-screen native <dialog> (focus moves in and back, Esc closes).
 * Closes when a link is picked; the page behind doesn't scroll.
 */
export function MobileMenu({ links, bookHref }: { links: NavLink[]; bookHref: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const release = lockScroll();
    return release;
  }, [open]);

  const show = () => {
    dialog.current?.showModal();
    setOpen(true);
  };
  const close = () => dialog.current?.close();

  return (
    <>
      <button
        type="button"
        onClick={show}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="site-menu"
        className="inline-flex size-11 items-center justify-center rounded-full hover:bg-muted lg:hidden"
      >
        <Menu aria-hidden className="size-6" />
        <span className="sr-only">Menu</span>
      </button>

      <dialog
        ref={dialog}
        id="site-menu"
        aria-label="Menu"
        onClose={() => setOpen(false)}
        className="m-0 h-dvh max-h-none w-full max-w-none bg-background p-0 text-foreground backdrop:bg-transparent open:flex open:flex-col"
      >
        <div className="flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
          <span className="font-heading text-lg font-bold">{site.name}</span>
          <button
            type="button"
            onClick={close}
            autoFocus
            className="inline-flex size-11 items-center justify-center rounded-full hover:bg-muted"
          >
            <X aria-hidden className="size-6" />
            <span className="sr-only">Close menu</span>
          </button>
        </div>
        <div aria-hidden className="pole-stripe h-1.5" />

        <nav aria-label="Sections" className="flex-1 overflow-y-auto px-4 py-6">
          <ul className="space-y-1">
            {links.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  onClick={close}
                  className="flex min-h-14 items-center rounded-lg px-2 font-heading text-h2 font-bold hover:bg-muted"
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-8 flex items-start gap-2 px-2 text-muted-foreground">
            <MapPin aria-hidden className="mt-0.5 size-5 shrink-0" />
            {site.address.street}, {site.address.area} {site.address.postcode}
          </p>
        </nav>

        <div className="grid grid-cols-2 gap-3 border-t px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Link href={bookHref} onClick={close} className={cn(buttonVariants({ variant: "pop", size: "lg" }))}>
            Book
          </Link>
          <a href={`tel:${site.phone.e164}`} className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>
            <Phone aria-hidden />
            Call
          </a>
        </div>
      </dialog>
    </>
  );
}
