import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Gallery } from "@/components/public/gallery";
import { Hero } from "@/components/public/hero";
import { Reviews } from "@/components/public/reviews";
import { SectionHeading } from "@/components/public/section-heading";
import { ServicesList } from "@/components/public/services-list";
import { Slideshow } from "@/components/public/slideshow";
import { StickyBookBar } from "@/components/public/sticky-book-bar";
import { Team } from "@/components/public/team";
import { Visit } from "@/components/public/visit";
import { WEEKDAYS } from "@/lib/domain/hours";
import { site, siteUrl } from "@/lib/site";
import { getSiteContent, type SiteContent } from "@/lib/site-content";

const SCHEMA_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** BarberShop structured data (no self-reported review markup). */
function jsonLd(content: SiteContent) {
  const url = siteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "BarberShop",
    name: site.name,
    url,
    image: content.shopPhoto?.url ?? `${url}/opengraph-image.png`,
    logo: `${url}/brand/badge-disc-512.png`,
    telephone: site.phone.e164,
    address: {
      "@type": "PostalAddress",
      streetAddress: site.address.street,
      addressLocality: site.address.area,
      addressRegion: "Merseyside",
      postalCode: site.address.postcode,
      addressCountry: site.address.country,
    },
    paymentAccepted: site.paymentText,
    sameAs: Object.values(site.socials),
    openingHoursSpecification: WEEKDAYS.flatMap((d) => {
      const h = content.shopHours[d];
      return h ? [{ "@type": "OpeningHoursSpecification", dayOfWeek: SCHEMA_DAYS[Number(d) - 1], opens: h.open, closes: h.close }] : [];
    }),
  };
}

export default async function HomePage() {
  const content = await getSiteContent();
  return (
    <>
      <main id="main">
        <Hero content={content} />
        <ServicesList services={content.services} discountText={content.discountText} />

        {content.recentCuts.length > 0 && (
          <section aria-labelledby="cuts-title" id="cuts" className="scroll-mt-20">
            <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
              <SectionHeading
                id="cuts-title"
                eyebrow="Portfolio"
                title="Recent cuts"
                accent="cuts"
                action={
                  <Link href="/book" className="group inline-flex min-h-11 items-center gap-2 font-semibold underline-offset-4 hover:underline">
                    Want one like these? Book
                    <ArrowUpRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </Link>
                }
              />
              <Gallery photos={content.recentCuts} />
            </div>
          </section>
        )}

        {content.slideshow.length > 0 && (
          <section aria-labelledby="inside-title" id="inside" className="scroll-mt-20 px-2 sm:px-3">
            <div className="mx-auto max-w-7xl rounded-[1.75rem] bg-card px-4 py-16 sm:rounded-[2.25rem] sm:px-6 lg:px-10 lg:py-24">
              <SectionHeading id="inside-title" eyebrow="The shop" title="Inside the shop" accent="shop" className="items-center text-center md:flex-col md:items-center" />
              <Slideshow photos={content.slideshow} />
            </div>
          </section>
        )}

        <Team team={content.team} />
        <Reviews
          reviews={content.reviews}
          googleRating={content.googleRating}
          googleReviewCount={content.googleReviewCount}
          googleReviewUrl={content.googleReviewUrl}
        />
        <Visit content={content} />
      </main>
      <StickyBookBar />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(content)).replace(/</g, "\\u003c") }}
      />
    </>
  );
}
