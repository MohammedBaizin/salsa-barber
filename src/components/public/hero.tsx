import Image from "next/image";
import Link from "next/link";
import { Phone, Star } from "lucide-react";
import { PlaceholderTag } from "@/components/placeholder-tag";
import { buttonVariants } from "@/components/ui/button";
import { site, unconfirmed } from "@/lib/site";
import type { SiteContent } from "@/lib/site-content";
import { cn } from "@/lib/utils";
import { OpenStatus } from "./open-status";

/**
 * Poster-style hero: label, big name with the yellow marker, live open status, Book + Call, payments and rating.
 * Shop photo as a tilted landscape card with the badge as a sticker; logo-led when there's no photo.
 */
export function Hero({ content }: { content: SiteContent }) {
  const { shopPhoto, googleRating, googleReviewCount, googleReviewUrl } = content;
  const closures = content.closures.map((c) => c.date);

  return (
    <section aria-labelledby="hero-title" className="relative overflow-x-clip">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 pt-8 pb-14 sm:px-6 md:pt-14 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-14 lg:px-8 lg:pb-20">
        <div>
          <p className="text-label font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Barbers in {site.address.area}
            {unconfirmed.area && <PlaceholderTag note="Confirm the area name" />}
          </p>
          <h1 id="hero-title" className="mt-3 text-display font-extrabold">
            Salsa <span className="marker">Barber</span>
          </h1>
          <OpenStatus hours={content.shopHours} closures={closures} className="mt-5" />

          <div className="mt-6 flex flex-wrap gap-3">
            <Link id="hero-book" href="/book" className={cn(buttonVariants({ variant: "pop", size: "lg" }), "min-w-40")}>
              Book a cut
            </Link>
            <a href={`tel:${site.phone.e164}`} className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>
              <Phone aria-hidden />
              Call {site.phone.display}
            </a>
          </div>

          <dl className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <div className="flex gap-1.5">
              <dt className="text-muted-foreground">Pay by</dt>
              <dd className="font-semibold">{site.paymentText}</dd>
            </div>
            {content.walkInText && (
              <div>
                <dt className="sr-only">Walk-ins</dt>
                <dd className="font-semibold">{content.walkInText}</dd>
              </div>
            )}
          </dl>

          {googleRating != null && (
            <a
              href={googleReviewUrl ?? undefined}
              target={googleReviewUrl ? "_blank" : undefined}
              rel="noopener noreferrer"
              className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full border bg-card px-4 text-sm font-semibold hover:bg-muted"
            >
              <Star aria-hidden className="size-4 fill-highlight text-highlight" />
              <span>
                {googleRating.toFixed(1)} on Google
                {googleReviewCount != null && <span className="font-normal text-muted-foreground"> · {googleReviewCount} reviews</span>}
              </span>
            </a>
          )}
        </div>

        {shopPhoto ? (
          <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
            <div aria-hidden className="absolute -inset-x-2 top-6 -bottom-4 -rotate-2 rounded-3xl bg-highlight sm:-inset-x-4" />
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border-2 border-shadow-hard bg-muted shadow-pop rotate-1">
              <Image
                src={shopPhoto.url}
                alt={shopPhoto.alt}
                fill
                priority
                sizes="(min-width: 1152px) 540px, (min-width: 1024px) 46vw, (min-width: 640px) 576px, calc(100vw - 2rem)"
                className="object-cover"
              />
            </div>
            <Image
              src="/brand/badge-disc-160.webp"
              alt=""
              width={96}
              height={96}
              className="absolute -bottom-6 -left-2 size-20 rotate-[-8deg] drop-shadow-md sm:size-24"
            />
          </div>
        ) : (
          <div className="relative mx-auto w-full max-w-sm">
            <div aria-hidden className="pole-stripe absolute inset-x-6 -bottom-3 h-3 rounded-full" />
            <Image src="/brand/badge-disc-640.webp" alt={`${site.name} logo`} width={640} height={640} priority sizes="24rem" className="relative h-auto w-full" />
          </div>
        )}
      </div>
    </section>
  );
}
