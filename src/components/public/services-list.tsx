import Link from "next/link";
import { ArrowUpRight, CalendarDays, Clock, Tag } from "lucide-react";
import { formatPence } from "@/lib/domain/money";
import { formatDays, formatMinutes } from "@/lib/domain/time";
import type { SiteContent } from "@/lib/site-content";
import { SectionHeading } from "./section-heading";

/**
 * Price list as a grid of compact cards. Each card reads name → price → length (the price is shown on the right but read
 * right after the name), so the link's accessible name starts
 * "Hair Cut £17", and tapping anywhere on it starts a booking for that service.
 */
export function ServicesList({ services, discountText }: Pick<SiteContent, "services" | "discountText">) {
  if (services.length === 0) return null;
  return (
    <section aria-labelledby="services-title" id="services" className="scroll-mt-20">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <SectionHeading
          id="services-title"
          eyebrow="The menu"
          title="Services & prices"
         
          intro="Clear prices, no surprises. Tap any service to book it online."
        />
        {discountText && (
          <p className="mb-8 flex items-center gap-3 rounded-2xl border border-primary/40 bg-primary/10 px-5 py-4 font-medium">
            <span aria-hidden className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Tag className="size-4" />
            </span>
            {discountText}
          </p>
        )}

        <ul className="reveal grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-3">
          {services.map((s) => (
            <li key={s.id}>
              <Link
                href={`/book?service=${s.id}`}
                className="group flex h-full items-center gap-4 rounded-2xl border border-border bg-card px-5 py-4 transition-[border-color,box-shadow,translate] duration-300 hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-[var(--shadow-soft)] sm:px-6"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-heading text-base leading-snug font-bold tracking-tight sm:text-lg">{s.name}</span>
                  <span className="sr-only"> {formatPence(s.pricePence)} </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Clock aria-hidden className="size-3.5" />
                      {formatMinutes(s.durationMin)}
                    </span>
                    {s.bookableDays && <span className="sr-only"> · </span>}
                    {s.bookableDays && (
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays aria-hidden className="size-3.5" />
                        {formatDays(s.bookableDays)} only
                      </span>
                    )}
                    <span className="sr-only">, book now</span>
                  </span>
                </span>
                <span aria-hidden className="price shrink-0 rounded-full bg-primary/15 px-3.5 py-1.5 text-lg leading-none text-foreground ring-1 ring-primary/30 ring-inset sm:text-xl">
                  {formatPence(s.pricePence)}
                </span>
                <span
                  aria-hidden
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-all duration-300 group-hover:rotate-45 group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground"
                >
                  <ArrowUpRight className="size-4" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
