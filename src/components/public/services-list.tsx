import Link from "next/link";
import { ArrowUpRight, Tag } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { formatPence } from "@/lib/domain/money";
import { formatDays, formatMinutes } from "@/lib/domain/time";
import type { SiteContent } from "@/lib/site-content";
import { cn } from "@/lib/utils";
import { SectionHeading } from "./section-heading";

/**
 * Price list: a sticky intro (heading, discount, Book) beside a list of rows. Each row reads name → price → length,
 * so the link's accessible name starts "Hair Cut £17", and tapping it starts a booking for that service.
 */
export function ServicesList({ services, discountText }: Pick<SiteContent, "services" | "discountText">) {
  if (services.length === 0) return null;
  return (
    <section aria-labelledby="services-title" id="services" className="scroll-mt-20">
      <div className="mx-auto grid max-w-7xl gap-2 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16 lg:px-8 lg:py-28">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <SectionHeading
            id="services-title"
            eyebrow="The menu"
            title="Services & prices"
            accent="prices"
            intro="Tap any service to book it online."
            className="mb-8 md:mb-8"
          />
          {discountText && (
            <p className="mb-8 flex items-start gap-3 rounded-2xl border border-primary/40 bg-primary/10 px-5 py-4 font-medium">
              <Tag aria-hidden className="mt-0.5 size-5 shrink-0 text-link" />
              {discountText}
            </p>
          )}
          <Link href="/book" className={cn(buttonVariants({ variant: "pop", size: "lg" }), "hidden lg:inline-flex")}>
            Book an appointment
            <ArrowUpRight aria-hidden className="size-5" />
          </Link>
        </div>

        <ul className="reveal border-t border-border">
          {services.map((s) => (
            <li key={s.id} className="border-b border-border">
              <Link
                href={`/book?service=${s.id}`}
                className="group grid min-h-20 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-4 gap-y-1 py-4 transition-[padding] duration-300 hover:px-3 sm:gap-x-6"
              >
                <span className="col-start-1 row-start-1 font-heading text-lg font-bold tracking-tight sm:text-xl">{s.name}</span>
                <span className="price col-start-2 row-span-2 row-start-1 text-price">{formatPence(s.pricePence)}</span>
                <span className="col-start-1 row-start-2 text-sm text-muted-foreground">
                  {formatMinutes(s.durationMin)}
                  {s.bookableDays && <> · {formatDays(s.bookableDays)} only</>}
                  <span className="sr-only">, book now</span>
                </span>
                <span
                  aria-hidden
                  className="col-start-3 row-span-2 row-start-1 inline-flex size-10 items-center justify-center rounded-full border border-border transition-colors duration-300 group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground"
                >
                  <ArrowUpRight className="size-4 transition-transform duration-300 group-hover:rotate-45" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
