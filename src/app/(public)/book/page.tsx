import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BookingFlow } from "@/components/booking/booking-flow";
import { BookingOff } from "@/components/booking/booking-off";
import { bookingEnabled } from "@/lib/booking/config";
import { getBookingOptions } from "@/lib/booking/options";
import { formatUkMobile } from "@/lib/domain/phone";
import { site } from "@/lib/site";
import { getSiteContent } from "@/lib/site-content";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Book", description: `Book a cut at ${site.name}, ${site.address.area}.` };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** The booking a customer is changing (?change=) or booking another from (?for=), by its private token only. */
async function managed(token: string) {
  if (!UUID.test(token)) return null;
  const { data } = await createAdminClient().rpc("get_managed_booking", { p_token: token });
  return data?.[0] ?? null;
}

/**
 * Reads ?service= and ?barber= on the server so the right step is in the first response.
 * ?change=<token>: the customer's own booking is being changed (service and barber filled in, name and number
 * kept, their current time counts as free). ?for=<token>: "Book another" with their name and number filled in.
 */
async function Flow({ searchParams }: { searchParams: PageProps<"/book">["searchParams"] }) {
  const search = await searchParams;
  const options = await getBookingOptions();
  if (options.services.length === 0 || options.barbers.length === 0) {
    const content = await getSiteContent();
    return <BookingOff hours={content.shopHours} walkInText={content.walkInText} reason="empty" />;
  }
  const shop = { phoneDisplay: site.phone.display, phoneE164: site.phone.e164, whatsappE164: site.whatsapp?.e164 ?? null };

  const changeToken = one(search.change);
  if (changeToken) {
    const b = await managed(changeToken);
    if (!b?.can_change) {
      return (
        <div className="max-w-xl space-y-4 rounded-3xl border bg-card p-6" data-testid="change-refused">
          <h2 className="text-h3 font-bold">This booking can&apos;t be changed online</h2>
          <p>It may be too close to the appointment, or it&apos;s already been cancelled. Please message or call the shop.</p>
          {b ? (
            <Link href={`/booking/${changeToken}`} className="text-link underline underline-offset-4 hover:no-underline">
              Back to your booking
            </Link>
          ) : null}
        </div>
      );
    }
    return (
      <>
        <p className="mb-6 rounded-2xl border border-status-request-foreground/30 bg-status-request p-4 font-medium text-status-request-foreground">
          Changing your booking. Your current time stays booked until the new one is sent; the change goes to the shop as a new request.
        </p>
        <BookingFlow
          services={options.services}
          barbers={options.barbers}
          shop={shop}
          replaces={changeToken}
          initialName={b.customer_name}
          initialPhone={b.phone ? formatUkMobile(b.phone) : ""}
        />
      </>
    );
  }

  const forToken = one(search.for);
  const from = forToken ? await managed(forToken) : null;
  return (
    <BookingFlow
      services={options.services}
      barbers={options.barbers}
      shop={shop}
      initialName={from?.customer_name ?? ""}
      initialPhone={from?.phone ? formatUkMobile(from.phone) : ""}
      nameLabel={from ? "Who is this for?" : undefined}
      carry={from && forToken ? { for: forToken } : undefined}
    />
  );
}

export default async function BookPage({ searchParams }: PageProps<"/book">) {
  const enabled = bookingEnabled();
  const content = enabled ? null : await getSiteContent();
  return (
    <main id="main" className="relative mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-16 lg:px-8">
      <div aria-hidden className="glow-spot pointer-events-none absolute -top-32 right-0 -z-10 size-[30rem] opacity-70" />
      <p className="eyebrow">Online booking</p>
      <h1 className="mt-4 mb-10 text-h1 font-extrabold md:mb-14">
        Book a <span className="serif-accent text-[1.1em]">cut</span>
      </h1>
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
