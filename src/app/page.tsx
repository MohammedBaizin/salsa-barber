import Image from "next/image";
import { MapPin, Phone } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { PlaceholderTag } from "@/components/placeholder-tag";
import { site, unconfirmed } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * Phase 0 holding page: brand, address and call button. Replaced by the full homepage in phase 5.
 */
export default function HoldingPage() {
  const { address, phone, socials, maps } = site;
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 sm:px-8">
        <span className="font-heading text-lg font-bold tracking-tight">{site.name}</span>
        <ThemeToggle />
      </header>

      <main id="main" className="mx-auto grid max-w-6xl gap-10 px-4 pt-6 pb-16 sm:px-8 md:grid-cols-[1.1fr_0.9fr] md:items-center md:pt-14">
        <div>
          <p className="text-label font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Barbers in {address.area}
            {unconfirmed.area && <PlaceholderTag note="Confirm the area name" />}
          </p>
          <h1 className="mt-4 text-display font-extrabold">
            Salsa <span className="marker">Barber</span>
          </h1>
          <p className="mt-5 max-w-prose text-lead text-muted-foreground">
            Call the shop to book. Online booking is coming soon.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href={`tel:${phone.e164}`} className={cn(buttonVariants({ variant: "pop", size: "lg" }))}>
              <Phone aria-hidden />
              Call {phone.display}
            </a>
            <a
              href={maps.directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
            >
              <MapPin aria-hidden />
              Directions
            </a>
          </div>
          <address className="mt-8 text-body not-italic">
            {address.street}, {address.area} {address.postcode}
          </address>
          <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium" aria-label="Social media">
            {Object.entries(socials).map(([name, url]) => (
              <li key={name}>
                <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center capitalize text-link underline underline-offset-4 hover:no-underline">
                  {name === "tiktok" ? "TikTok" : name}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mx-auto w-full max-w-sm md:max-w-md">
          <div aria-hidden className="pole-stripe absolute inset-x-6 -bottom-3 h-3 rounded-full opacity-90" />
          <Image
            src="/brand/badge-disc-640.webp"
            alt={`${site.name} logo`}
            width={640}
            height={640}
            priority
            sizes="(min-width: 768px) 28rem, 24rem"
            className="relative h-auto w-full"
          />
        </div>
      </main>
    </>
  );
}
