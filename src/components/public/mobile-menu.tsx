"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, MapPin, Menu, Phone, X } from "lucide-react";
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
        className="inline-flex size-11 items-center justify-center rounded-full border border-border/80 hover:bg-muted lg:hidden"
      >
        <Menu aria-hidden className="size-5" />
        <span className="sr-only">Menu</span>
      </button>

      <dialog
        ref={dialog}
        id="site-menu"
        aria-label="Menu"
        onClose={() => setOpen(false)}
        className="dark m-0 h-dvh max-h-none w-full max-w-none bg-background p-0 text-foreground backdrop:bg-transparent open:flex open:flex-col"
      >
        <div aria-hidden className="glow-spot pointer-events-none absolute -top-24 -right-24 size-96" />
        <div className="relative flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
          <span className="font-heading text-lg font-extrabold">
            Salsa <span className="serif-accent text-[1.15em]">Barber</span>
          </span>
          <button
            type="button"
            onClick={close}
            autoFocus
            className="inline-flex size-11 items-center justify-center rounded-full border border-border hover:bg-muted"
          >
            <X aria-hidden className="size-5" />
            <span className="sr-only">Close menu</span>
          </button>
        </div>

        <nav aria-label="Sections" className="relative flex-1 overflow-y-auto px-4 py-8">
          <ul>
            {links.map((l, i) => (
              <li key={l.href} className="border-b border-border">
                <a
                  href={l.href}
                  onClick={close}
                  className="group flex min-h-18 items-center gap-4 py-2 font-heading text-[2.5rem] leading-none font-extrabold tracking-tight"
                >
                  <span aria-hidden className="w-8 text-sm font-medium tabular-nums text-muted-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {l.label}
                  <ArrowUpRight aria-hidden className="ml-auto size-6 text-muted-foreground transition-colors group-hover:text-primary" />
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-8 flex items-start gap-2 text-muted-foreground">
            <MapPin aria-hidden className="mt-0.5 size-5 shrink-0" />
            {site.address.street}, {site.address.area} {site.address.postcode}
          </p>
        </nav>

        <div className="relative grid grid-cols-2 gap-3 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
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
