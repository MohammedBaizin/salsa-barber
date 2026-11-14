import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Phone } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";
import { HeaderShell } from "./header-shell";
import { MobileMenu } from "./mobile-menu";
import { headerIconButton, type NavLink } from "./nav";
import { SectionNav } from "./section-nav";

/**
 * Floating header. At the top of the page it's a clear, full-width row; once you scroll it tightens into a
 * narrower frosted-glass pill with a soft shadow. Desktop: badge + name, section links with a gliding highlight
 * and scroll-spy, Call and Book. Phones: badge + name, theme toggle, Call icon and the menu button.
 */
export function SiteHeader({ links }: { links: NavLink[] }) {
  return (
    <HeaderShell>
      <div
        className={cn(
          "relative mx-auto flex h-16 max-w-7xl items-center gap-2 rounded-full border border-transparent pr-2 pl-2 sm:pl-3",
          "transition-[max-width,background-color,border-color,box-shadow] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
          "group-data-[scrolled=true]/header:max-w-6xl group-data-[scrolled=true]/header:border-border/70",
          "group-data-[scrolled=true]/header:bg-background/70 group-data-[scrolled=true]/header:shadow-[var(--shadow-soft)]",
          "group-data-[scrolled=true]/header:backdrop-blur-xl group-data-[scrolled=true]/header:backdrop-saturate-150",
        )}
      >
        <Link href="/" className="group mr-auto flex min-h-11 items-center gap-2.5 rounded-full pr-2">
          <span className="relative">
            <span aria-hidden className="absolute inset-0 rounded-full bg-primary/40 opacity-0 blur-md transition-opacity duration-500 group-hover:opacity-100" />
            <Image
              src="/brand/badge-disc-160.webp"
              alt=""
              width={44}
              height={44}
              loading="eager"
              className="relative size-11 transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:rotate-[-20deg]"
            />
          </span>
          <span className="flex flex-col">
            <span className="font-heading text-lg leading-none font-extrabold tracking-tight">
              Salsa <span className="serif-accent text-[1.15em] font-normal">Barber</span>
            </span>
            <span className="mt-1 hidden text-[0.6875rem] leading-none font-semibold tracking-[0.18em] text-muted-foreground uppercase sm:block">
              Barbers · {site.address.area}
            </span>
            <span className="sr-only">, home</span>
          </span>
        </Link>

        <nav aria-label="Sections" className="absolute left-1/2 hidden -translate-x-1/2 lg:block">
          <SectionNav links={links} />
        </nav>

        <ThemeToggle className={headerIconButton} />
        <a href={`tel:${site.phone.e164}`} className={cn(headerIconButton, "hidden sm:inline-flex xl:hidden")}>
          <Phone aria-hidden className="size-4" />
          <span className="sr-only">Call {site.phone.display}</span>
        </a>
        <a
          href={`tel:${site.phone.e164}`}
          className="hidden min-h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold tabular-nums transition-colors hover:bg-muted xl:inline-flex"
        >
          <span className="relative inline-flex size-7 items-center justify-center rounded-full bg-primary/15 text-link">
            <Phone aria-hidden className="size-3.5" />
          </span>
          {site.phone.display}
        </a>
        <Link href="/book" className={cn(buttonVariants({ variant: "pop" }), "hidden pr-2 lg:inline-flex")}>
          Book
          <span
            aria-hidden
            className="inline-flex size-7 items-center justify-center rounded-full bg-primary-foreground text-primary transition-transform duration-300 group-hover/button:rotate-45"
          >
            <ArrowUpRight className="size-4" />
          </span>
        </Link>
        <MobileMenu links={links} bookHref="/book" />
      </div>
    </HeaderShell>
  );
}
