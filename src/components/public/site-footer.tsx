import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Phone } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { site } from "@/lib/site";
import type { SiteContent } from "@/lib/site-content";
import { cn } from "@/lib/utils";
import { OpeningHours } from "./opening-hours";
import { SocialLinks } from "./social-links";

/**
 * Footer, always dark (a `.dark` island): a big call to action, address and contact, hours, payments and socials,
 * a giant outlined wordmark, © and a discreet staff login.
 */
export function SiteFooter({ content }: { content: SiteContent }) {
  const { address, phone } = site;
  return (
    <footer className="px-2 pb-2 sm:px-3 sm:pb-3">
      <div className="dark relative isolate overflow-hidden rounded-[1.75rem] border border-border bg-background text-foreground sm:rounded-[2.25rem]">
        <div aria-hidden className="glow-spot absolute -top-48 -right-32 -z-10 size-[36rem]" />
        <div className="mx-auto max-w-7xl px-5 pt-16 pb-[max(2rem,calc(env(safe-area-inset-bottom)+6rem))] sm:px-8 md:pb-8 lg:px-10 lg:pt-24">
          <div className="flex flex-col gap-8 border-b border-border pb-14 lg:flex-row lg:items-end lg:justify-between">
            <p className="font-heading text-h1 font-extrabold">
              Ready for a fresh cut?
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/book" className={cn(buttonVariants({ variant: "pop", size: "lg" }))}>
                Book now
                <ArrowUpRight aria-hidden className="size-5" />
              </Link>
              <a href={`tel:${phone.e164}`} className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>
                <Phone aria-hidden />
                {phone.display}
              </a>
            </div>
          </div>

          <div className="grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr]">
            <div>
              <div className="flex items-center gap-3">
                <Image src="/brand/badge-disc-160.webp" alt="" width={48} height={48} className="size-12" />
                <h2 className="font-heading text-xl font-extrabold">{site.name}</h2>
              </div>
              <address className="mt-5 leading-relaxed text-muted-foreground not-italic">
                {address.street}
                <br />
                {address.area}, {address.city} {address.postcode}
              </address>
              <p className="mt-2">
                <a href={`tel:${phone.e164}`} className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4 hover:no-underline">
                  {phone.display}
                </a>
              </p>
            </div>
            <div>
              <h2 className="eyebrow">Opening hours</h2>
              <OpeningHours hours={content.shopHours} className="mt-5 text-sm" />
            </div>
            <div>
              <h2 className="eyebrow">Payments</h2>
              <p className="mt-5">{site.paymentText}</p>
              <h2 className="eyebrow mt-8">Follow us</h2>
              <SocialLinks className="mt-3" />
            </div>
          </div>

          <p aria-hidden className="text-outline -mb-[0.18em] font-heading text-[clamp(4rem,19vw,17rem)] leading-none font-extrabold tracking-[-0.05em] select-none">
            Salsa
          </p>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6 text-sm text-muted-foreground">
            <p>© {site.name}</p>
            {/* Full page load so the staff area's own theme applies before paint. */}
            <a href="/login" className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-foreground hover:no-underline">
              Staff login
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
