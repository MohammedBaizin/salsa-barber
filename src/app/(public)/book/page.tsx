import type { Metadata } from "next";
import { Suspense } from "react";
import { BookingFlow } from "@/components/booking/booking-flow";
import { BookingOff } from "@/components/booking/booking-off";
import { bookingEnabled } from "@/lib/booking/config";
import { getBookingOptions } from "@/lib/booking/options";
import { site } from "@/lib/site";
import { getSiteContent } from "@/lib/site-content";

export const metadata: Metadata = { title: "Book", description: `Book a cut at ${site.name}, ${site.address.area}.` };

/** Reads ?service= and ?barber= on the server so the right step is in the first response. */
async function Flow({ searchParams }: { searchParams: PageProps<"/book">["searchParams"] }) {
  await searchParams;
  const options = await getBookingOptions();
  if (options.services.length === 0 || options.barbers.length === 0) {
    const content = await getSiteContent();
    return <BookingOff hours={content.shopHours} walkInText={content.walkInText} reason="empty" />;
  }
  return (
    <BookingFlow
      services={options.services}
      barbers={options.barbers}
      shop={{ phoneDisplay: site.phone.display, phoneE164: site.phone.e164, whatsappE164: site.whatsapp?.e164 ?? null }}
    />
  );
}

export default async function BookPage({ searchParams }: PageProps<"/book">) {
  const enabled = bookingEnabled();
  const content = enabled ? null : await getSiteContent();
  return (
    <main id="main" className="mx-auto max-w-5xl px-4 py-10 sm:px-6 md:py-14 lg:px-8">
      <h1 className="text-h1 font-extrabold">Book a cut</h1>
      <div aria-hidden className="pole-stripe mt-3 mb-8 h-1.5 w-16 rounded-full" />
      {content ? (
        <BookingOff hours={content.shopHours} walkInText={content.walkInText} />
      ) : (
        <Suspense fallback={<p className="py-10 text-muted-foreground">Loading…</p>}>
          <Flow searchParams={searchParams} />
        </Suspense>
      )}
    </main>
  );
}
