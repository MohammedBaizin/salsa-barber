import { MapPin, MessageCircle, Phone } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { site } from "@/lib/site";
import type { SiteContent } from "@/lib/site-content";
import { cn } from "@/lib/utils";
import { MapCard } from "./map-card";
import { OpeningHours } from "./opening-hours";
import { SectionHeading } from "./section-heading";
import { SocialLinks } from "./social-links";
import { UpcomingClosures } from "./upcoming-closures";

/** Visit: hours, closed days, address and contact, payments, walk-in text, and the click-to-load map. */
export function Visit({ content }: { content: SiteContent }) {
  const { address, phone, whatsapp } = site;
  return (
    <section aria-labelledby="visit-title" id="visit" className="scroll-mt-20 border-t">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <SectionHeading id="visit-title" title="Visit us" />
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[1fr_1fr_1.3fr]">
          <div>
            <h3 className="text-h3 font-bold">Opening hours</h3>
            <OpeningHours hours={content.shopHours} className="mt-4" />
            {content.walkInText && <p className="mt-5 font-semibold">{content.walkInText}</p>}
            <UpcomingClosures closures={content.closures} />
          </div>

          <div>
            <h3 className="text-h3 font-bold">Find us</h3>
            <address className="mt-4 flex items-start gap-2 not-italic">
              <MapPin aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
              <span>
                {address.street}
                <br />
                {address.area}, {address.city}
                <br />
                {address.postcode}
              </span>
            </address>
            <div className="mt-5 flex flex-wrap gap-3">
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
            <p className="mt-5 text-sm">
              <span className="text-muted-foreground">Pay by </span>
              <span className="font-semibold">{site.paymentText}</span>
            </p>
            <SocialLinks className="mt-3" />
          </div>

          <div className="md:col-span-2 lg:col-span-1">
            <MapCard />
          </div>
        </div>
      </div>
    </section>
  );
}
