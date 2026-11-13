import Image from "next/image";
import Link from "next/link";
import { Phone } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";
import { MobileMenu } from "./mobile-menu";
import type { NavLink } from "./nav";

/** Sticky header: badge + name, section links (desktop), theme toggle, Call, Book. Same colour as the page. */
export function SiteHeader({ links }: { links: NavLink[] }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="mr-auto flex min-h-11 items-center gap-2.5 rounded-lg" aria-label={`${site.name}, home`}>
          <Image src="/brand/badge-disc-160.webp" alt="" width={40} height={40} loading="eager" className="size-10" />
          <span className="font-heading text-lg font-extrabold tracking-tight">{site.name}</span>
        </Link>

        <nav aria-label="Sections" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {links.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold hover:bg-muted">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <ThemeToggle />
        <a
          href={`tel:${site.phone.e164}`}
          className="hidden min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold hover:bg-muted sm:inline-flex"
        >
          <Phone aria-hidden className="size-4" />
          {site.phone.display}
        </a>
        <Link href="/book" className={cn(buttonVariants({ variant: "pop" }), "hidden lg:inline-flex")}>
          Book
        </Link>
        <MobileMenu links={links} bookHref="/book" />
      </div>
    </header>
  );
}
