"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, MapPin, Phone, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { lockScroll } from "@/lib/scroll-lock";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";
import { headerIconButton, type NavLink } from "./nav";
import { SocialLinks } from "./social-links";

/**
 * Phone menu: full-screen native <dialog> (focus moves in and back, Esc closes), always dark.
 * Fades in, then the big numbered links rise in one after another. Closes when a link is picked;
 * the page behind doesn't scroll.
 */
export function MobileMenu({ links, bookHref }: { links: NavLink[]; bookHref: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    return lockScroll();
  }, [open]);

  const show = () => {
    dialog.current?.showModal();
    setOpen(true);
  };
  const close = () => dialog.current?.close();
  const rise = (i: number) => ({ animationDelay: `${80 + i * 55}ms` });

  return (
    <>
      <button
        type="button"
        onClick={show}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="site-menu"
        className={cn(headerIconButton, "group/menu flex-col gap-[5px] lg:hidden")}
      >
        <span aria-hidden className="h-[2px] w-[18px] rounded-full bg-current transition-transform duration-300 group-hover/menu:translate-x-[2px]" />
        <span aria-hidden className="h-[2px] w-[18px] rounded-full bg-current transition-transform duration-300 group-hover/menu:-translate-x-[2px]" />
        <span className="sr-only">Menu</span>
      </button>

      <dialog
        ref={dialog}
        id="site-menu"
        aria-label="Menu"
        onClose={() => setOpen(false)}
        className="dark m-0 h-dvh max-h-none w-full max-w-none overflow-hidden bg-background p-0 text-foreground backdrop:bg-transparent open:flex open:flex-col open:animate-in open:fade-in open:duration-300"
      >
        <div aria-hidden className="glow-spot pointer-events-none absolute -top-32 -right-32 size-[28rem]" />
        <div aria-hidden className="dot-grid pointer-events-none absolute inset-0 opacity-30 [mask-image:linear-gradient(to_bottom,black,transparent_60%)]" />

        <div className="relative flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
          <span className="font-heading text-lg font-extrabold">
            Salsa <span className="serif-accent text-[1.15em] font-normal">Barber</span>
          </span>
          <button type="button" onClick={close} autoFocus className={cn(headerIconButton, "transition-transform duration-300 hover:rotate-90")}>
            <X aria-hidden className="size-5" />
            <span className="sr-only">Close menu</span>
          </button>
        </div>

        <nav aria-label="Sections" className="relative flex-1 overflow-y-auto px-4 pt-6 pb-8">
          <p className="eyebrow mb-4">Menu</p>
          {open && (
            <ul>
              {links.map((l, i) => (
                <li
                  key={l.href}
                  style={rise(i)}
                  className="border-b border-border animate-in fade-in slide-in-from-bottom-4 fill-mode-both duration-500"
                >
                  <a
                    href={l.href}
                    onClick={close}
                    className="group flex min-h-18 items-center gap-4 py-2 font-heading text-[2.5rem] leading-none font-extrabold tracking-tight transition-colors hover:text-primary"
                  >
                    <span aria-hidden className="w-8 font-sans text-sm font-medium tabular-nums text-muted-foreground">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {l.label}
                    <ArrowUpRight
                      aria-hidden
                      className="ml-auto size-6 text-muted-foreground transition-all duration-300 group-hover:rotate-45 group-hover:text-primary"
                    />
                  </a>
                </li>
              ))}
            </ul>
          )}

          <div style={rise(links.length)} className={cn("mt-10 space-y-5", open && "animate-in fade-in slide-in-from-bottom-4 fill-mode-both duration-500")}>
            <p className="flex items-start gap-2 text-muted-foreground">
              <MapPin aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
              {site.address.street}, {site.address.area} {site.address.postcode}
            </p>
            <SocialLinks />
          </div>
        </nav>

        <div className="relative grid grid-cols-2 gap-3 border-t border-border px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Link href={bookHref} onClick={close} className={cn(buttonVariants({ variant: "pop", size: "lg" }))}>
            Book
            <ArrowUpRight aria-hidden className="size-5" />
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
