import Image from "next/image";
import { Check, Star } from "lucide-react";
import { PlaceholderTag } from "@/components/placeholder-tag";
import { site, unconfirmed } from "@/lib/site";
import { heroPhotos, type SitePhoto, type SiteContent } from "@/lib/site-content";
import { cn } from "@/lib/utils";
import { BookCallButtons } from "./book-call-buttons";
import { HeroCarousel } from "./hero-carousel";
import { OpenStatus } from "./open-status";

/**
 * Hero in a rounded frame. It is always dark (a `.dark` island), so it reads the same in both themes.
 *
 * With a shop photo: name, tagline and ticked notes first (left on desktop), then a cross-fading carousel of the shop
 * photo and the first "Inside the shop" photo (see `heroPhotos`) in a thin gold gradient frame with the Google rating on top and the open / closed status and address (from `sm`) along its bottom, and Book + Call
 * just under it.
 * With no photo, the badge logo glows on the right behind the text instead.
 */
export function Hero({ content }: { content: SiteContent }) {
  return (
    <section aria-labelledby="hero-title" className="px-2 pt-2 sm:px-3 sm:pt-3">
      {content.shopPhoto ? <PhotoHero content={content} photos={heroPhotos(content)} /> : <LogoHero content={content} />}
    </section>
  );
}

function PhotoHero({ content, photos }: { content: SiteContent; photos: SitePhoto[] }) {
  return (
    <div className="dark relative isolate overflow-hidden rounded-[1.75rem] bg-background p-2 text-foreground sm:rounded-[2.25rem] sm:p-3 lg:p-4">
      <div aria-hidden className="glow-spot absolute bottom-[-20%] left-[-15%] -z-10 size-[36rem] opacity-60" />

      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-center lg:gap-6">
        <div className="order-2">
          {/* Thin gold-to-glass gradient border with a warm glow behind the photo. */}
          <div className="rounded-[1.6rem] bg-[linear-gradient(140deg,rgba(255,194,14,0.7),rgba(255,255,255,0.08)_35%,rgba(255,255,255,0.04)_65%,rgba(255,194,14,0.35))] p-px shadow-[0_30px_90px_-35px_rgba(255,194,14,0.45)] sm:rounded-[2.1rem]">
            <HeroCarousel
              photos={photos}
              className="rounded-[calc(1.6rem-1px)] sm:rounded-[calc(2.1rem-1px)]"
              overlay={
                <>
                  <Chips content={content} size="sm" className="absolute top-3 left-3 sm:top-4 sm:left-4" />
                  <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2 sm:inset-x-4 sm:bottom-4">
                    <OpenStatus hours={content.shopHours} closures={content.closures.map((c) => c.date)} size="sm" />
                    <figcaption className="glass hidden h-7 min-w-0 items-center rounded-full border border-white/15 px-2.5 text-[0.6875rem] font-medium text-white/90 sm:inline-flex">
                      <span className="truncate">
                        {site.address.street}, {site.address.area}
                      </span>
                      {unconfirmed.area && <PlaceholderTag note="Confirm the area name" />}
                    </figcaption>
                  </div>
                </>
              }
            />
          </div>
          <BookCallButtons id="hero-book" className="mt-3 sm:mt-4" />
        </div>

        <div className="order-1 p-4 pt-5 pb-4 sm:p-6 lg:p-6">
          <Headline content={content} />
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
          <Headline content={content} highlights={false} />
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

/**
 * Name set large and tight with a soft top-to-bottom sheen, a short gold rule, a calm one-line tagline and (with
 * `highlights`) payment and walk-in notes as small glass pills. One typeface throughout; only size, weight and colour
 * change.
 */
function Headline({ content, highlights = true }: { content: SiteContent; highlights?: boolean }) {
  const notes = [site.paymentText, content.walkInText?.replace(/\.$/, "")].filter((n): n is string => !!n);
  return (
    <div className="min-w-0">
      <h1
        id="hero-title"
        className="bg-gradient-to-b from-white via-white to-white/60 bg-clip-text pb-1 font-heading text-[clamp(2.75rem,1.4rem+5vw,5.25rem)] leading-[0.95] font-extrabold tracking-[-0.045em] whitespace-nowrap text-transparent"
      >
        {site.name}
      </h1>
      <span aria-hidden className="mt-5 block h-[3px] w-12 rounded-full bg-gradient-to-r from-primary to-primary/30 sm:mt-6" />
      <p className="mt-5 max-w-sm text-lg leading-relaxed font-medium text-balance text-muted-foreground sm:mt-6 sm:text-xl">
        Sharp cuts, clean fades and hot-towel shaves.
      </p>
      {highlights && notes.length > 0 && (
        <ul className="mt-6 flex flex-wrap gap-2">
          {notes.map((n) => (
            <li
              key={n}
              className="inline-flex h-8 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] pr-3.5 pl-1.5 text-[0.8125rem] font-medium text-foreground/85"
            >
              <span aria-hidden className="inline-flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Check className="size-3" strokeWidth={3} />
              </span>
              {n}
            </li>
          ))}
        </ul>
      )}
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
