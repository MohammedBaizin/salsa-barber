import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { ManageActions } from "@/components/booking/manage-actions";
import { bookingEnabled } from "@/lib/booking/config";
import { customerChangeRequest, whatsappLink } from "@/lib/domain/messages";
import { formatPence } from "@/lib/domain/money";
import { formatUkMobile } from "@/lib/domain/phone";
import { formatDateTime, formatMinutes } from "@/lib/domain/time";
import { noticeLabel } from "@/lib/domain/settings";
import { site, siteUrl } from "@/lib/site";
import { createAdminClient } from "@/lib/supabase/admin";
import { cn } from "@/lib/utils";
import { connection } from "next/server";

export const metadata: Metadata = { title: "Your booking", robots: { index: false, follow: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUS: Record<string, { title: string; text: string; tone: "wait" | "ok" | "off" }> = {
  pending: {
    title: "Request sent",
    text: "Your booking is not confirmed yet. The shop will reply by WhatsApp or text to confirm.",
    tone: "wait",
  },
  confirmed: { title: "Booking confirmed", text: "See you then.", tone: "ok" },
  completed: { title: "Thanks for visiting", text: "This booking is complete.", tone: "ok" },
  declined: { title: "The shop couldn't fit this in", text: "Sorry, this request was declined. Please pick another time or call the shop.", tone: "off" },
  cancelled: { title: "Booking cancelled", text: "This booking has been cancelled.", tone: "off" },
  no_show: { title: "Missed appointment", text: "This booking was marked as missed.", tone: "off" },
};

/**
 * The customer's private page, opened ONLY by its unguessable token (never by phone number). Change, cancel
 * (both stop at the shop's cut-off, enforced in the database), WhatsApp/Call, book another, copy link.
 */
async function BookingDetails({ params }: { params: PageProps<"/booking/[token]">["params"] }) {
  await connection();
  const { token } = await params;
  if (!UUID.test(token)) notFound();
  const db = createAdminClient();
  const [{ data }, { data: settings }] = await Promise.all([
    db.rpc("get_managed_booking", { p_token: token }),
    db.from("settings").select("change_cutoff_minutes").eq("id", 1).single(),
  ]);
  const b = data?.[0];
  if (!b) notFound();
  const online = await bookingEnabled();
  const active = b.status === "pending" || b.status === "confirmed";
  const barberParam = b.any_barber ? "any" : b.staff_id;
  const changeHref = b.can_change && online ? `/book?${new URLSearchParams({ service: b.service_id, barber: barberParam, step: "time", change: token })}` : null;
  const shopText = active
    ? customerChangeRequest(
        { name: b.customer_name, serviceName: b.service_name, barberName: b.staff_name, startsAt: new Date(b.starts_at), pricePence: b.price_pence, manageToken: token },
        { name: site.name, siteUrl: siteUrl() },
      )
    : `Hi ${site.name}, `;

  const status = STATUS[b.status] ?? STATUS.pending;
  const Icon = status.tone === "ok" ? CheckCircle2 : status.tone === "off" ? XCircle : Clock;
  const startsAt = new Date(b.starts_at);

  return (
    <>
      <div
        className={cn(
          "flex items-start gap-3 rounded-3xl border p-6",
          status.tone === "wait" && "border-status-request-foreground/30 bg-status-request text-status-request-foreground",
          status.tone === "ok" && "border-status-done-foreground/30 bg-status-done text-status-done-foreground",
          status.tone === "off" && "border-border bg-status-cancelled text-status-cancelled-foreground",
        )}
        data-testid="booking-status"
      >
        <Icon aria-hidden className="mt-0.5 size-6 shrink-0" />
        <div>
          <h1 className="text-h2 font-extrabold">{status.title}</h1>
          <p className="mt-1 font-medium">{status.text}</p>
        </div>
      </div>

      <dl className="mt-6 grid gap-x-8 gap-y-5 rounded-3xl border bg-card p-6 sm:p-8 sm:grid-cols-2">
        <Row label="Service">
          {b.service_name} · {formatPence(b.price_pence)} · {formatMinutes(b.duration_min)}
        </Row>
        <Row label="Barber">{b.any_barber && b.status === "pending" ? `Any barber (${b.staff_name} pencilled in)` : b.staff_name}</Row>
        <Row label="When">{formatDateTime(startsAt)}</Row>
        <Row label="Name">{b.customer_name}</Row>
        {b.phone && <Row label="We'll message">{formatUkMobile(b.phone)}</Row>}
        <Row label="Where">
          {site.name}, {site.address.street}, {site.address.area} {site.address.postcode}
        </Row>
      </dl>

      <ManageActions
        token={token}
        canCancel={b.can_change}
        active={active}
        past={new Date(b.starts_at) <= new Date()}
        cutoffText={noticeLabel(settings?.change_cutoff_minutes ?? 120)}
        changeHref={changeHref}
        anotherHref={online ? `/book?for=${token}` : null}
        whatsappHref={site.whatsapp ? whatsappLink(site.whatsapp.e164, shopText) : null}
        phone={{ display: site.phone.display, e164: site.phone.e164 }}
        directionsUrl={site.maps.directionsUrl}
      />
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-semibold">{children}</dd>
    </div>
  );
}

export default function ManagedBookingPage({ params }: PageProps<"/booking/[token]">) {
  return (
    <main id="main" className="mx-auto max-w-3xl px-4 py-10 sm:px-6 md:py-14">
      <Suspense fallback={<p className="py-10 text-muted-foreground">Loading your booking…</p>}>
        <BookingDetails params={params} />
      </Suspense>
    </main>
  );
}
