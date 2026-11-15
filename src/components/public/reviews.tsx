import { ArrowUpRight, Quote, Star } from "lucide-react";
import type { SiteContent } from "@/lib/site-content";
import { cn } from "@/lib/utils";
import { SectionHeading } from "./section-heading";
import { SectionDivider } from "./section-divider";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-10-03" -> "October 2026" (no clock needed). */
function reviewMonth(date: string): string {
  const [y, m] = date.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

function Stars({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("inline-flex gap-0.5", className)} role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} aria-hidden className={cn("size-4", i <= value ? "fill-highlight text-highlight" : "text-muted-foreground/50")} />
      ))}
    </span>
  );
}

/** Google rating summary + review cards in a keyboard-reachable scroller. Reviews are copied word for word. */
export function Reviews({ reviews, googleRating, googleReviewCount, googleReviewUrl }: Pick<SiteContent, "reviews" | "googleRating" | "googleReviewCount" | "googleReviewUrl">) {
  if (reviews.length === 0 && googleRating == null) return null;
  return (
    <section aria-labelledby="reviews-title" id="reviews" className="relative scroll-mt-20 overflow-hidden">
      <SectionDivider />
      <div aria-hidden className="glow-spot absolute -top-40 left-1/2 size-[40rem] -translate-x-1/2 opacity-60" />
      <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <SectionHeading
          id="reviews-title"
          eyebrow="Word of mouth"
          title="What customers say"
          action={
            googleRating != null ? (
              <div className="flex items-center gap-4">
                <span className="price text-[3.5rem] leading-none sm:text-[4.5rem]">{googleRating.toFixed(1)}</span>
                <div>
                  <Stars value={Math.round(googleRating)} />
                  <p className="mt-1 text-sm text-muted-foreground">
                    {googleReviewCount != null ? `${googleReviewCount} Google reviews` : "Google rating"}
                  </p>
                  {googleReviewUrl && (
                    <a
                      href={googleReviewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-link underline underline-offset-4 hover:no-underline"
                    >
                      Read reviews on Google
                      <ArrowUpRight aria-hidden className="size-4" />
                    </a>
                  )}
                </div>
              </div>
            ) : undefined
          }
        />
        {reviews.length > 0 && (
          <ul
            tabIndex={0}
            aria-label="Customer reviews"
            className="reveal -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-3 lg:gap-6 lg:overflow-visible lg:px-0"
          >
            {reviews.map((r) => (
              <li
                key={r.id}
                className="flex w-[85%] shrink-0 snap-start flex-col rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-soft)] sm:w-[60%] lg:w-auto lg:p-8"
              >
                <div className="flex items-center justify-between">
                  <Stars value={r.stars} />
                  <Quote aria-hidden className="size-8 fill-primary text-primary" />
                </div>
                <blockquote className="mt-5 flex-1 text-lg leading-relaxed">“{r.body}”</blockquote>
                <p className="mt-6 flex items-center gap-3 border-t border-border pt-5 text-sm">
                  <span aria-hidden className="inline-flex size-9 items-center justify-center rounded-full bg-muted font-heading font-bold">
                    {r.author.trim().charAt(0).toUpperCase()}
                  </span>
                  <span className="flex-1">
                    <span className="block font-semibold">{r.author}</span>
                    {r.date && <span className="text-muted-foreground">{reviewMonth(r.date)}</span>}
                  </span>
                  {r.isGoogle && <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">Google</span>}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
