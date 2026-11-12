import { Star } from "lucide-react";
import type { SiteContent } from "@/lib/site-content";
import { cn } from "@/lib/utils";
import { SectionHeading } from "./section-heading";

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
    <section aria-labelledby="reviews-title" id="reviews" className="scroll-mt-20 border-t bg-card">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <SectionHeading id="reviews-title" title="What customers say" />
        {googleRating != null && (
          <div className="mb-8 flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="price text-h1">{googleRating.toFixed(1)}</span>
            <div>
              <Stars value={Math.round(googleRating)} />
              <p className="text-sm text-muted-foreground">
                {googleReviewCount != null ? `${googleReviewCount} Google reviews` : "Google rating"}
              </p>
            </div>
            {googleReviewUrl && (
              <a
                href={googleReviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center font-semibold text-link underline underline-offset-4 hover:no-underline"
              >
                Read reviews on Google
              </a>
            )}
          </div>
        )}
        {reviews.length > 0 && (
          <ul
            tabIndex={0}
            aria-label="Customer reviews"
            className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0"
          >
            {reviews.map((r) => (
              <li key={r.id} className="flex w-[85%] shrink-0 snap-start flex-col rounded-2xl border bg-background p-5 sm:w-[60%] lg:w-auto">
                <Stars value={r.stars} />
                <blockquote className="mt-3 flex-1 text-body">“{r.body}”</blockquote>
                <p className="mt-4 text-sm">
                  <span className="font-semibold">{r.author}</span>
                  {r.date && <span className="text-muted-foreground"> · {reviewMonth(r.date)}</span>}
                  {r.isGoogle && <span className="ml-2 rounded-sm bg-muted px-1.5 py-0.5 text-xs font-semibold">Google</span>}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
