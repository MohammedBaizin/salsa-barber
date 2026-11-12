import Link from "next/link";
import { ChevronRight, Tag } from "lucide-react";
import { formatPence } from "@/lib/domain/money";
import { formatDays, formatMinutes } from "@/lib/domain/time";
import type { SiteContent } from "@/lib/site-content";
import { SectionHeading } from "./section-heading";

/** Menu-board price list: name, dotted leader, price; length and bookable days underneath. Each row starts a booking. */
export function ServicesList({ services, discountText }: Pick<SiteContent, "services" | "discountText">) {
  if (services.length === 0) return null;
  return (
    <section aria-labelledby="services-title" id="services" className="scroll-mt-20 border-t bg-card">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <SectionHeading id="services-title" title="Services & prices" />
        {discountText && (
          <p className="mb-8 inline-flex items-start gap-2 rounded-lg bg-highlight px-4 py-3 font-semibold text-highlight-foreground">
            <Tag aria-hidden className="mt-0.5 size-5 shrink-0" />
            {discountText}
          </p>
        )}
        <ul className="grid gap-x-12 md:grid-cols-2">
          {services.map((s) => (
            <li key={s.id} className="border-b border-border/80">
              <Link
                href={`/book?service=${s.id}`}
                className="group flex min-h-16 flex-col justify-center gap-1 py-3 hover:bg-muted/60 sm:px-2"
              >
                <span className="flex items-baseline gap-3">
                  <span className="font-semibold">{s.name}</span>
                  <span aria-hidden className="min-w-6 flex-1 translate-y-[-0.2em] border-b-2 border-dotted border-muted-foreground/50" />
                  <span className="price text-price">{formatPence(s.pricePence)}</span>
                  <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </span>
                <span className="text-sm text-muted-foreground">
                  {formatMinutes(s.durationMin)}
                  {s.bookableDays && <> · {formatDays(s.bookableDays)} only</>}
                  <span className="sr-only">, book now</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
