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

function Stars({ value, className, size = "size-4" }: { value: number; className?: string; size?: string }) {
  return (
    <span className={cn("inline-flex gap-0.5", className)} role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} aria-hidden className={cn(size, i <= value ? "fill-highlight text-highlight" : "text-muted-foreground/40")} />
      ))}
    </span>
  );
}

/** Google's four-colour "G". Decorative: callers give it a text label. */
function GoogleMark({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className}>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

type Props = Pick<SiteContent, "reviews" | "googleRating" | "googleReviewCount" | "googleReviewUrl">;

/** Dark Google rating card: logo, big score, stars, review count and a link to the reviews on Google. */
function RatingCard({ rating, count, url }: { rating: number; count: number | null; url: string | null }) {
  return (
    <div className="dark relative isolate overflow-hidden rounded-[1.75rem] border border-white/10 bg-background p-6 text-foreground shadow-[0_30px_80px_-40px_rgba(0,0,0,0.7)] sm:p-7 lg:sticky lg:top-28">
      <div aria-hidden className="glow-spot absolute -top-24 -right-24 -z-10 size-72 opacity-80" />
      <p className="flex items-center gap-2.5 text-sm font-semibold">
        <span className="inline-flex size-9 items-center justify-center rounded-full bg-white">
          <GoogleMark className="size-5" />
        </span>
        Google rating
      </p>
      <p className="mt-6 flex items-end gap-2">
        <span className="text-[4.5rem] leading-[0.85] font-extrabold tracking-[-0.05em] tabular-nums sm:text-[5rem]">{rating.toFixed(1)}</span>
        <span className="pb-1.5 text-lg font-semibold text-muted-foreground">/ 5</span>
      </p>
      <Stars value={Math.round(rating)} size="size-5" className="mt-4" />
      <p className="mt-2 text-sm text-muted-foreground">{count != null ? `${count} Google reviews` : "Google rating"}</p>
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="group/g mt-6 inline-flex h-11 w-full items-center justify-between gap-3 rounded-full bg-primary pr-1.5 pl-5 text-sm font-semibold text-primary-foreground shadow-pop transition-[translate,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-12px_var(--glow)]"
        >
          Read reviews on Google
          <span aria-hidden className="inline-flex size-8 items-center justify-center rounded-full bg-primary-foreground text-primary transition-transform duration-300 group-hover/g:rotate-45">
            <ArrowUpRight className="size-4" />
          </span>
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      )}
    </div>
  );
}

/**
 * Google rating card (left, stays in view on desktop) beside the review cards: a swipeable row on phones, a two-column
 * grid from `sm`. Reviews are copied word for word.
 */
export function Reviews({ reviews, googleRating, googleReviewCount, googleReviewUrl }: Props) {
  if (reviews.length === 0 && googleRating == null) return null;
  const hasRating = googleRating != null;
  return (
    <section aria-labelledby="reviews-title" id="reviews" className="relative scroll-mt-20 overflow-hidden">
      <SectionDivider />
      <div aria-hidden className="glow-spot absolute -top-40 left-1/2 size-[40rem] -translate-x-1/2 opacity-60" />
      <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <SectionHeading id="reviews-title" eyebrow="Word of mouth" title="What customers say" />
        <div className={cn("grid items-start gap-6", hasRating && reviews.length > 0 && "lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-8")}>
          {hasRating && <RatingCard rating={googleRating} count={googleReviewCount} url={googleReviewUrl} />}
          {reviews.length > 0 && (
            <ul
              tabIndex={0}
              aria-label="Customer reviews"
              className="reveal -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0"
            >
              {reviews.map((r) => (
                <li
                  key={r.id}
                  className="relative flex w-[85%] shrink-0 snap-start flex-col rounded-3xl border border-border bg-card p-6 transition-[translate,border-color,box-shadow] duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-[var(--shadow-soft)] sm:w-auto"
                >
                  <Quote aria-hidden className="absolute top-5 right-5 size-10 fill-primary/15 text-primary/0" />
                  <div className="flex items-center gap-2">
                    <Stars value={r.stars} />
                    {r.isGoogle && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                        <GoogleMark className="size-3.5" />
                        Google
                      </span>
                    )}
                  </div>
                  <blockquote className="mt-4 flex-1 text-[1.0625rem] leading-relaxed text-pretty text-foreground/90">“{r.body}”</blockquote>
                  <p className="mt-6 flex items-center gap-3 text-sm">
                    <span
                      aria-hidden
                      className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-[color-mix(in_oklab,var(--primary),black_25%)] font-bold text-primary-foreground"
                    >
                      {r.author.trim().charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{r.author}</span>
                      {r.date && <span className="text-xs text-muted-foreground">{reviewMonth(r.date)}</span>}
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
