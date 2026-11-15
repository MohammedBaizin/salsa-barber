import { Clock, MapPin, MessageCircle, Phone } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { site } from "@/lib/site";
import type { SiteContent } from "@/lib/site-content";
import { cn } from "@/lib/utils";
import { MapCard } from "./map-card";
import { OpeningHours } from "./opening-hours";
import { SectionHeading } from "./section-heading";
import { SocialLinks } from "./social-links";
import { UpcomingClosures } from "./upcoming-closures";
import { SectionDivider } from "./section-divider";

/** Visit: a bento of cards for hours (and closed days), address and contact, and the map. */
export function Visit({ content }: { content: SiteContent }) {
  const { address, phone, whatsapp } = site;
  return (
    <section aria-labelledby="visit-title" id="visit" className="scroll-mt-20">
      <SectionDivider />
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <SectionHeading id="visit-title" eyebrow="Come by" title="Visit us" />
        <div className="reveal grid gap-4 md:grid-cols-2 lg:grid-cols-12 lg:gap-6">
          <div className="rounded-3xl border border-border bg-card p-6 sm:p-8 lg:col-span-4">
            <h3 className="flex items-center gap-2 text-h3 font-bold">
              <Clock aria-hidden className="size-5 text-link" />
              Opening hours
            </h3>
            <OpeningHours hours={content.shopHours} className="mt-5" />
            {content.walkInText && <p className="mt-6 border-t border-border pt-5 font-semibold">{content.walkInText}</p>}
            <UpcomingClosures closures={content.closures} />
          </div>

          <div className="flex flex-col rounded-3xl border border-border bg-card p-6 sm:p-8 lg:col-span-3">
            <h3 className="flex items-center gap-2 text-h3 font-bold">
              <MapPin aria-hidden className="size-5 text-link" />
              Find us
            </h3>
            <address className="mt-5 text-lg leading-snug not-italic">
              {address.street}
              <br />
              {address.area}, {address.city}
              <br />
              <span className="font-semibold">{address.postcode}</span>
            </address>
            <div className="mt-6 flex flex-wrap gap-2">
              <a href={`tel:${phone.e164}`} className={cn(buttonVariants({ variant: "outline" }))}>
                <Phone aria-hidden />
                {phone.display}
              </a>
              {whatsapp && (
                <a
                  href={`https://wa.me/${whatsapp.e164.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(buttonVariants({ variant: "outline" }))}
                >
                  <MessageCircle aria-hidden />
                  WhatsApp
                </a>
              )}
            </div>
            <div className="mt-auto pt-6">
              <p className="text-sm">
                <span className="text-muted-foreground">Pay by </span>
                <span className="font-semibold">{site.paymentText}</span>
              </p>
              <h3 className="eyebrow mt-6">Follow us</h3>
              <SocialLinks className="mt-3" />
            </div>
          </div>

          <div className="md:col-span-2 lg:col-span-5">
            <MapCard />
          </div>
        </div>
      </div>
    </section>
  );
}
