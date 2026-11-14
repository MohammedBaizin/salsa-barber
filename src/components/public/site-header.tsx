import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Phone } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";
import { MobileMenu } from "./mobile-menu";
import type { NavLink } from "./nav";

/** Sticky frosted-glass header: badge + name, section links in a pill (desktop), theme toggle, Call, Book. */
export function SiteHeader({ links }: { links: NavLink[] }) {
  return (
    <header className="glass sticky top-0 z-40 border-b border-border/60 pt-[env(safe-area-inset-top)]">
      <div className="relative mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:px-6 md:h-18 lg:px-8">
        <Link href="/" className="group mr-auto flex min-h-11 items-center gap-3 rounded-full" aria-label={`${site.name}, home`}>
          <Image
            src="/brand/badge-disc-160.webp"
            alt=""
            width={40}
            height={40}
            loading="eager"
            className="size-10 transition-transform duration-500 group-hover:rotate-[-12deg]"
          />
          <span className="font-heading text-lg leading-none font-extrabold tracking-tight">
            Salsa <span className="serif-accent text-[1.15em] font-normal">Barber</span>
          </span>
        </Link>

        <nav aria-label="Sections" className="absolute left-1/2 hidden -translate-x-1/2 lg:block">
          <ul className="flex items-center gap-1 rounded-full border border-border/70 bg-card/60 p-1">
            {links.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  className="inline-flex min-h-10 items-center rounded-full px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <ThemeToggle />
        <a
          href={`tel:${site.phone.e164}`}
          className="hidden min-h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold tabular-nums hover:bg-muted sm:inline-flex lg:hidden xl:inline-flex"
        >
          <Phone aria-hidden className="size-4" />
          {site.phone.display}
        </a>
        <Link href="/book" className={cn(buttonVariants({ variant: "pop" }), "hidden lg:inline-flex")}>
          Book
          <ArrowUpRight aria-hidden className="size-4 transition-transform group-hover/button:translate-x-0.5 group-hover/button:-translate-y-0.5" />
        </Link>
        <MobileMenu links={links} bookHref="/book" />
      </div>
    </header>
  );
}
