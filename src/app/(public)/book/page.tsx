import type { Metadata } from "next";
import { MessageCircle, Phone } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { OpeningHours } from "@/components/public/opening-hours";
import { site } from "@/lib/site";
import { getSiteContent } from "@/lib/site-content";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Book" };

/**
 * Online booking isn't switched on yet: "call us / WhatsApp" panel (spec §4.3).
 * The booking flow replaces this page in phase 5 and keeps this panel for when booking is off.
 */
export default async function BookPage() {
  const content = await getSiteContent();
  const { phone, whatsapp } = site;
  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-12 sm:px-6 md:py-20">
      <h1 className="text-h1 font-extrabold">Book a cut</h1>
      <div aria-hidden className="pole-stripe mt-3 h-1.5 w-16 rounded-full" />
      <p className="mt-6 text-lead">Online booking is coming soon. For now, give us a call or send a WhatsApp and we&apos;ll find you a time.</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <a href={`tel:${phone.e164}`} className={cn(buttonVariants({ variant: "pop", size: "lg" }))}>
          <Phone aria-hidden />
          Call {phone.display}
        </a>
        {whatsapp && (
          <a href={`https://wa.me/${whatsapp.e164.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>
            <MessageCircle aria-hidden />
            WhatsApp
          </a>
        )}
      </div>
      {content.walkInText && <p className="mt-6 font-semibold">{content.walkInText}</p>}
      <div className="mt-10 rounded-2xl border bg-card p-6">
        <h2 className="text-h3 font-bold">Opening hours</h2>
        <OpeningHours hours={content.shopHours} className="mt-4" />
      </div>
    </main>
  );
}
