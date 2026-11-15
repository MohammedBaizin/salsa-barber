import Image from "next/image";
import { Star } from "lucide-react";
import { PlaceholderTag } from "@/components/placeholder-tag";
import { site, unconfirmed } from "@/lib/site";
import type { SitePhoto, SiteContent } from "@/lib/site-content";
import { cn } from "@/lib/utils";
import { BookCallButtons } from "./book-call-buttons";
import { OpenStatus } from "./open-status";

/**
 * Hero in a rounded frame. It is always dark (a `.dark` island), so it reads the same in both themes.
 *
 * With a shop photo, the photo is shown whole and undimmed in its own framed panel: under the headline on phones, on
 * the right on desktop. The Google rating sits on the photo, and the open / closed status and Book + Call
 * sit just under it.
 * With no photo, the badge logo glows on the right behind the text instead.
 */
export function Hero({ content }: { content: SiteContent }) {
  return (
    <section aria-labelledby="hero-title" className="px-2 pt-2 sm:px-3 sm:pt-3">
      {content.shopPhoto ? <PhotoHero content={content} photo={content.shopPhoto} /> : <LogoHero content={content} />}
    </section>
  );
}

function PhotoHero({ content, photo }: { content: SiteContent; photo: SitePhoto }) {
  return (
    <div className="dark relative isolate overflow-hidden rounded-[1.75rem] bg-background p-2 text-foreground sm:rounded-[2.25rem] sm:p-3 lg:p-4">
      <div aria-hidden className="glow-spot absolute bottom-[-20%] left-[-15%] -z-10 size-[36rem] opacity-60" />

      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-center lg:gap-4">
        <div className="order-2">
          <figure className="group relative isolate overflow-hidden rounded-[1.5rem] bg-muted shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)] sm:rounded-[2rem]">
            <div className="relative aspect-4/3 lg:aspect-5/4">
              <Image
                src={photo.url}
                alt={photo.alt}
                fill
                preload
                quality={80}
                sizes="(min-width: 1024px) 55vw, 100vw"
                className="object-cover transition-transform duration-[1.2s] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.03] motion-reduce:transition-none"
              />
            </div>
            {/* Soft fades top and bottom so the small labels stay readable on any photo. */}
            <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.45),transparent_28%,transparent_70%,rgba(0,0,0,0.55))]" />
            <div aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-white/10 ring-inset" />
            <Chips content={content} size="sm" className="absolute inset-x-3 top-3 sm:inset-x-4 sm:top-4" />
            <figcaption className="glass absolute bottom-3 left-3 inline-flex h-7 items-center rounded-full border border-white/15 px-2.5 text-[0.6875rem] font-medium text-white/90 sm:bottom-4 sm:left-4">
              {site.address.street}, {site.address.area}
              {unconfirmed.area && <PlaceholderTag note="Confirm the area name" />}
            </figcaption>
          </figure>
          <div className="px-2 pt-4 pb-2 sm:px-3">
            <OpenStatus hours={content.shopHours} closures={content.closures.map((c) => c.date)} />
            <BookCallButtons id="hero-book" className="mt-4" />
          </div>
        </div>

        <div className="order-1 flex flex-col p-4 pt-5 sm:p-6 lg:justify-between lg:p-6">
          <Headline />
          <Facts content={content} className="mt-8 hidden sm:grid sm:grid-cols-2 lg:mt-10" />
        </div>
      </div>
    </div>
  );
}

function LogoHero({ content }: { content: SiteContent }) {
  return (
    <div className="dark relative isolate flex min-h-[calc(100svh-5.5rem)] flex-col overflow-hidden rounded-[1.75rem] bg-background text-foreground sm:rounded-[2.25rem] lg:min-h-[min(calc(100svh-6rem),58rem)]">
      <div aria-hidden className="dot-grid absolute inset-0 -z-20 opacity-60 [mask-image:radial-gradient(ellipse_at_70%_40%,black,transparent_70%)]" />
      <div aria-hidden className="glow-spot absolute top-1/2 right-[-10%] -z-10 size-[42rem] -translate-y-1/2" />
      <div className="pointer-events-none absolute top-[38%] right-[-18%] -z-10 w-[min(34rem,80vw)] -translate-y-1/2 opacity-35 sm:right-[-6%] lg:top-1/2 lg:right-[6%] lg:opacity-100">
        <Image
          src="/brand/badge-disc-640.webp"
          alt={`${site.name} logo`}
          width={640}
          height={640}
          preload
          sizes="34rem"
          className="h-auto w-full drop-shadow-[0_30px_60px_rgba(255,194,14,0.25)]"
        />
      </div>

      <div className="p-6 sm:p-8 lg:p-10">
        <Chips content={content} />
      </div>

      <div className="mt-auto grid gap-8 p-6 pt-0 sm:p-8 sm:pt-0 lg:grid-cols-[1fr_auto] lg:items-end lg:p-10 lg:pt-0">
        <div className="min-w-0 max-w-4xl">
          <OpenStatus hours={content.shopHours} closures={content.closures.map((c) => c.date)} className="mb-6" />
          <Headline />
          <BookCallButtons id="hero-book" className="mt-8" />
        </div>
        <Facts content={content} className="glass hidden rounded-3xl border border-white/10 p-5 sm:grid sm:grid-cols-2 lg:w-72 lg:grid-cols-1" />
      </div>
    </div>
  );
}

/** Google rating pill. `sm` is the compact version laid over the hero photo. */
function Chips({ content, className, size = "md" }: { content: SiteContent; className?: string; size?: "sm" | "md" }) {
  const { googleRating, googleReviewCount, googleReviewUrl } = content;
  const sm = size === "sm";
  const pill = cn("glass inline-flex items-center rounded-full border border-white/15", sm ? "h-7 px-2.5" : "min-h-11 px-4");
  return (
    <div className={cn("flex flex-wrap items-center", sm ? "gap-1.5" : "gap-3", className)}>
      {googleRating != null && (
        <a
          href={googleReviewUrl ?? undefined}
          target={googleReviewUrl ? "_blank" : undefined}
          rel="noopener noreferrer"
          className={cn(pill, "shrink-0 font-semibold hover:bg-white/10", sm ? "gap-1 text-[0.6875rem] text-white/90" : "gap-2 text-sm")}
        >
          <Star aria-hidden className={cn("fill-highlight text-highlight", sm ? "size-3" : "size-4")} />
          <span>
            {googleRating.toFixed(1)} on Google
            {googleReviewCount != null && <span className="hidden font-normal text-muted-foreground sm:inline"> · {googleReviewCount} reviews</span>}
          </span>
        </a>
      )}
    </div>
  );
}

/** Headline and one-line pitch. */
function Headline() {
  return (
    <div className="min-w-0">
      <h1 id="hero-title" className="font-heading text-h1 font-extrabold whitespace-nowrap">
        {site.name}
      </h1>
      <p className="mt-6 max-w-md text-lead text-muted-foreground">
        Cuts, fades, hot-towel shaves and beard trims on {site.address.street.replace(/^\d+\s*/, "")}, {site.address.area}.
      </p>
    </div>
  );
}

/** Payment and walk-in notes. */
function Facts({ content, className }: { content: SiteContent; className?: string }) {
  return (
    <dl className={cn("gap-4 text-sm", className)}>
      <div>
        <dt className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Pay by</dt>
        <dd className="mt-1 font-semibold">{site.paymentText}</dd>
      </div>
      {content.walkInText && (
        <div>
          <dt className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Walk-ins</dt>
          <dd className="mt-1 font-semibold">{content.walkInText}</dd>
        </div>
      )}
    </dl>
  );
}
