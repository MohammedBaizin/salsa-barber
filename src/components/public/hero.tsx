import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Phone, Star } from "lucide-react";
import { PlaceholderTag } from "@/components/placeholder-tag";
import { buttonVariants } from "@/components/ui/button";
import { site, unconfirmed } from "@/lib/site";
import type { SiteContent } from "@/lib/site-content";
import { cn } from "@/lib/utils";
import { OpenStatus } from "./open-status";

/**
 * Full-bleed hero in a rounded frame. It is always dark (a `.dark` island), so it reads the same in both themes:
 * the shop photo behind a soft gradient, a huge "Salsa *Barber*" headline, live open status, Book + Call, and glass
 * chips for the area and Google rating. With no photo, the badge logo glows on the right instead.
 * A slow services ticker runs underneath.
 */
export function Hero({ content }: { content: SiteContent }) {
  const { shopPhoto, googleRating, googleReviewCount, googleReviewUrl } = content;
  const closures = content.closures.map((c) => c.date);

  return (
    <section aria-labelledby="hero-title" className="px-2 pt-2 sm:px-3 sm:pt-3">
      <div className="dark relative isolate flex min-h-[calc(100svh-5.5rem)] flex-col overflow-hidden rounded-[1.75rem] bg-background text-foreground sm:rounded-[2.25rem] lg:min-h-[min(calc(100svh-6rem),58rem)]">
        {shopPhoto ? (
          <>
            <Image src={shopPhoto.url} alt={shopPhoto.alt} fill preload sizes="100vw" className="-z-20 object-cover object-[50%_40%]" />
            <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-[#0a0a0b] via-[#0a0a0b]/75 to-[#0a0a0b]/30" />
            <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-[#0a0a0b]/85 via-[#0a0a0b]/35 to-transparent" />
          </>
        ) : (
          <>
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
          </>
        )}

        <div className="flex items-start justify-between gap-3 p-5 sm:p-8 lg:p-10">
          <p className="glass inline-flex min-h-9 items-center rounded-full border border-white/15 px-4 text-xs font-semibold tracking-[0.16em] uppercase">
            Barbers in {site.address.area}
            {unconfirmed.area && <PlaceholderTag note="Confirm the area name" />}
          </p>
          {googleRating != null && (
            <a
              href={googleReviewUrl ?? undefined}
              target={googleReviewUrl ? "_blank" : undefined}
              rel="noopener noreferrer"
              className="glass inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-white/15 px-4 text-sm font-semibold hover:bg-white/10"
            >
              <Star aria-hidden className="size-4 fill-highlight text-highlight" />
              <span>
                {googleRating.toFixed(1)} on Google
                {googleReviewCount != null && <span className="hidden font-normal text-muted-foreground sm:inline"> · {googleReviewCount} reviews</span>}
              </span>
            </a>
          )}
        </div>

        <div className="mt-auto grid gap-8 p-5 pt-0 sm:p-8 sm:pt-0 lg:grid-cols-[1fr_auto] lg:items-end lg:p-10 lg:pt-0">
          <div className="min-w-0 max-w-4xl">
            <OpenStatus hours={content.shopHours} closures={closures} className="mb-6" />
            <h1 id="hero-title" className="text-display font-extrabold">
              Salsa <span className="serif-accent block text-[1.08em] text-primary">Barber</span>
            </h1>
            <p className="mt-6 max-w-md text-lead text-muted-foreground">
              Cuts, fades, hot-towel shaves and beard trims on {site.address.street.replace(/^\d+\s*/, "")}, {site.address.area}.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link id="hero-book" href="/book" className={cn(buttonVariants({ variant: "pop", size: "lg" }), "min-w-44")}>
                Book a cut
                <ArrowUpRight aria-hidden className="size-5 transition-transform group-hover/button:translate-x-0.5 group-hover/button:-translate-y-0.5" />
              </Link>
              <a href={`tel:${site.phone.e164}`} className={cn(buttonVariants({ variant: "outline", size: "lg" }), "glass")}>
                <Phone aria-hidden />
                Call {site.phone.display}
              </a>
            </div>
          </div>

          <dl className="glass hidden gap-4 rounded-3xl border border-white/10 p-5 text-sm sm:grid sm:grid-cols-2 lg:w-72 lg:grid-cols-1">
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
        </div>
      </div>

      {content.services.length > 0 && <ServicesTicker names={content.services.map((s) => s.name)} />}
    </section>
  );
}

/** Slow scrolling strip of service names. Decorative only: the real list is in the Services section. */
function ServicesTicker({ names }: { names: string[] }) {
  const items = [...names, ...names];
  return (
    <div aria-hidden className="relative mt-2 overflow-hidden py-5 [mask-image:linear-gradient(90deg,transparent,black_8%,black_92%,transparent)] sm:mt-3">
      <ul className="flex w-max animate-marquee motion-reduce:animate-none">
        {items.map((n, i) => (
          <li key={i} className="flex items-center gap-8 pr-8 font-heading text-2xl font-bold tracking-tight whitespace-nowrap text-muted-foreground sm:text-3xl">
            {n}
            <span className="text-primary">✦</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
