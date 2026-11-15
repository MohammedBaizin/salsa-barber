import Link from "next/link";
import { ArrowUpRight, CalendarDays, Clock, Tag } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { formatPence } from "@/lib/domain/money";
import { formatDays, formatMinutes } from "@/lib/domain/time";
import type { SiteContent } from "@/lib/site-content";
import { cn } from "@/lib/utils";
import { SectionHeading } from "./section-heading";

/**
 * Price list as a grid of cards. Each card reads name → price → length, so the link's accessible name starts
 * "Hair Cut £17", and tapping anywhere on it starts a booking for that service.
 */
export function ServicesList({ services, discountText }: Pick<SiteContent, "services" | "discountText">) {
  if (services.length === 0) return null;
  return (
    <section aria-labelledby="services-title" id="services" className="scroll-mt-20">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <SectionHeading
          id="services-title"
          eyebrow="The menu"
          title="Services & prices"
          accent="prices"
          intro="Clear prices, no surprises. Tap any service to book it online."
          action={
            <Link href="/book" className={cn(buttonVariants({ variant: "pop", size: "lg" }))}>
              Book an appointment
              <ArrowUpRight aria-hidden className="size-5" />
            </Link>
          }
        />
        {discountText && (
          <p className="mb-8 flex items-center gap-3 rounded-2xl border border-primary/40 bg-primary/10 px-5 py-4 font-medium">
            <span aria-hidden className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Tag className="size-4" />
            </span>
            {discountText}
          </p>
        )}

        <ul className="reveal grid gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
          {services.map((s) => (
            <li key={s.id}>
              <Link
                href={`/book?service=${s.id}`}
                className="group flex h-full flex-col rounded-3xl border border-border bg-card p-4 transition-all duration-300 hover:-translate-y-1 hover:border-primary/70 hover:shadow-[var(--shadow-soft)] sm:p-6"
              >
                <span className="flex items-start justify-between gap-4">
                  <span className="font-heading text-lg leading-snug font-bold tracking-tight sm:text-xl">{s.name}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="price text-[1.5rem] leading-none sm:text-[1.625rem]">{formatPence(s.pricePence)}</span>
                    <ArrowUpRight aria-hidden className="size-4 text-muted-foreground sm:hidden" />
                  </span>
                </span>
                <span className="mt-3 flex flex-wrap gap-1.5 text-xs font-medium text-muted-foreground">
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1">
                    <Clock aria-hidden className="size-3.5" />
                    {formatMinutes(s.durationMin)}
                  </span>
                  {s.bookableDays && <span className="sr-only"> · </span>}
                  {s.bookableDays && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1">
                      <CalendarDays aria-hidden className="size-3.5" />
                      {formatDays(s.bookableDays)} only
                    </span>
                  )}
                  <span className="sr-only">, book now</span>
                </span>
                <span aria-hidden className="mt-auto hidden items-center justify-between pt-6 text-sm font-semibold sm:flex">
                  <span className="text-muted-foreground transition-colors group-hover:text-foreground">Book this</span>
                  <span className="inline-flex size-9 items-center justify-center rounded-full border border-border transition-all duration-300 group-hover:rotate-45 group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground">
                    <ArrowUpRight className="size-4" />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
