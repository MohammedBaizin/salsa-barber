import Link from "next/link";
import { Phone } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { site } from "@/lib/site";
import type { SiteContent } from "@/lib/site-content";
import { cn } from "@/lib/utils";
import { OpeningHours } from "./opening-hours";
import { SocialLinks } from "./social-links";

/** Footer: call to action, address and contact, hours, payments, © and a discreet staff login. */
export function SiteFooter({ content }: { content: SiteContent }) {
  const { address, phone } = site;
  return (
    <footer className="border-t-4 border-highlight bg-secondary text-secondary-foreground">
      <div className="mx-auto max-w-6xl px-4 pt-12 pb-[max(2.5rem,calc(env(safe-area-inset-bottom)+6rem))] sm:px-6 md:pb-10 lg:px-8">
        <div className="flex flex-col gap-5 border-b border-secondary-foreground/20 pb-10 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-heading text-h2 font-extrabold">Book your next cut</p>
          <div className="flex flex-wrap gap-3">
            <Link href="/book" className={cn(buttonVariants({ variant: "default", size: "lg" }))}>
              Book
            </Link>
            <a
              href={`tel:${phone.e164}`}
              className={cn(buttonVariants({ variant: "outline", size: "lg" }), "border-secondary-foreground text-secondary-foreground hover:bg-secondary-foreground/10")}
            >
              <Phone aria-hidden />
              {phone.display}
            </a>
          </div>
        </div>

        <div className="grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <h2 className="font-heading text-lg font-bold">{site.name}</h2>
            <address className="mt-3 not-italic opacity-90">
              {address.street}
              <br />
              {address.area}, {address.city} {address.postcode}
            </address>
            <p className="mt-3">
              <a href={`tel:${phone.e164}`} className="inline-flex min-h-11 items-center underline underline-offset-4 hover:no-underline">
                {phone.display}
              </a>
            </p>
          </div>
          <div>
            <h2 className="font-heading text-lg font-bold">Opening hours</h2>
            <OpeningHours hours={content.shopHours} className="mt-3 text-sm" />
          </div>
          <div>
            <h2 className="font-heading text-lg font-bold">Payments</h2>
            <p className="mt-3">{site.paymentText}</p>
            <div className="mt-4 [&_a]:text-secondary-foreground">
              <SocialLinks />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-secondary-foreground/20 pt-6 text-sm opacity-90">
          <p>© {site.name}</p>
          {/* Full page load so the staff area's own theme applies before paint. */}
          <a href="/login" className="inline-flex min-h-11 items-center underline underline-offset-4 hover:no-underline">
            Staff login
          </a>
        </div>
      </div>
    </footer>
  );
}
