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
          <section aria-labelledby="cuts-title" id="cuts" className="scroll-mt-20 border-t">
            <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
              <SectionHeading id="cuts-title" title="Recent cuts" />
              <Gallery photos={content.recentCuts} />
            </div>
          </section>
        )}

        {content.slideshow.length > 0 && (
          <section aria-labelledby="inside-title" id="inside" className="scroll-mt-20 border-t bg-card">
            <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
              <SectionHeading id="inside-title" title="Inside the shop" />
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
