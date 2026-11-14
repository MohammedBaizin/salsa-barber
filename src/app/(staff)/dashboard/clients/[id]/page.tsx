import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { BookingCard } from "@/components/dashboard/booking-card";
import { BookingsProvider } from "@/components/dashboard/bookings-provider";
import { BookAgainButton, ContactLinks, ManageClientButtons } from "@/components/dashboard/client-actions";
import { ClientLabelChip } from "@/components/dashboard/client-label";
import { LoadingLabel, Skeleton } from "@/components/dashboard/skeleton";
import { requireStaff } from "@/lib/auth/staff";
import { loadClient } from "@/lib/dashboard/clients";
import { bookAgainDefaults, clientLabels, safeClientsBackLink } from "@/lib/domain/clients";
import { formatPence } from "@/lib/domain/money";
import { formatUkMobile } from "@/lib/domain/phone";
import { isManager } from "@/lib/domain/team";
import { dateKey, formatDay, formatRelativeDay } from "@/lib/domain/time";

export const metadata: Metadata = { title: "Client" };

const PAST_SHOWN = 5;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border bg-card shadow-[var(--shadow-soft)] p-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-semibold">{children}</dd>
    </div>
  );
}

async function ClientPage({ params, searchParams }: PageProps<"/dashboard/clients/[id]">) {
  const staff = await requireStaff();
  const { id } = await params;
  const search = await searchParams;
  if (!UUID.test(id)) notFound();
  const now = new Date();
  const today = dateKey(now);
  // Barbers get "not found" for clients who've never booked with them (RLS).
  const data = await loadClient(staff, id, today);
  if (!data) notFound();

  const back = safeClientsBackLink(typeof search.back === "string" ? search.back : null);
  const showAll = search.all === "1";
  const { client, stats } = data;
  const dates = {
    visits: stats.visits,
    lastVisit: stats.lastVisit ? new Date(stats.lastVisit) : null,
    nextVisit: stats.nextVisit ? new Date(stats.nextVisit) : null,
  };
  const labels = clientLabels(dates, now, data.dueBackWeeks);
  const upcoming = data.bookings
    .filter((b) => (b.status === "pending" || b.status === "confirmed") && new Date(b.endsAt) > now)
    .reverse();
  const past = data.bookings.filter((b) => !upcoming.includes(b));
  const again = bookAgainDefaults(
    { usualServiceId: stats.usualServiceId, usualStaffId: stats.usualStaffId, usualStartMinute: stats.usualStartMinute },
    now,
  );
  const card = (b: (typeof data.bookings)[number]) => (
    <BookingCard booking={b} today={today} now={data.now} showDay showBarber={isManager(staff)} />
  );
  const allHref = `/dashboard/clients/${id}?back=${encodeURIComponent(back)}&all=1`;

  return (
    <BookingsProvider setup={data.setup} today={today}>
      <div className="space-y-6">
        <Link href={back} className="inline-flex min-h-11 items-center gap-2 text-link underline underline-offset-4 hover:no-underline">
          <ArrowLeft aria-hidden className="size-4" />
          Back to clients
        </Link>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-title font-extrabold">{client.name}</h1>
            {labels.map((l) => (
              <ClientLabelChip key={l} label={l} />
            ))}
          </div>
          <p className="text-muted-foreground">
            {formatUkMobile(client.phone)} · client since {formatDay(new Date(client.createdAt))}
          </p>
        </div>

        <ContactLinks client={client} dueBack={labels.includes("due_back")} />

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="client-stats">
          <Stat label="Visits">{stats.visits}</Stat>
          <Stat label={isManager(staff) ? "Spent" : "Spent with you"}>
            <span className="price">{formatPence(stats.spentPence)}</span>
          </Stat>
          <Stat label="No-shows">{stats.noShows}</Stat>
          <Stat label="Last visit">{dates.lastVisit ? formatRelativeDay(dateKey(dates.lastVisit), today) : "None yet"}</Stat>
          <Stat label="Usual service">{stats.usualServiceName ?? "—"}</Stat>
          <Stat label="Usual barber">{stats.usualStaffName ?? "—"}</Stat>
        </dl>

        <div className="flex flex-wrap gap-2">
          <BookAgainButton
            client={client}
            date={again.date}
            defaults={{ serviceId: again.serviceId, staffId: again.staffId, minute: again.minute }}
          />
          {isManager(staff) ? <ManageClientButtons client={client} upcoming={upcoming.length} /> : null}
        </div>

        <section aria-labelledby="upcoming-heading" className="space-y-3">
          <h2 id="upcoming-heading" className="text-h3 font-bold">
            Upcoming <span className="text-base text-muted-foreground">({upcoming.length})</span>
          </h2>
          {upcoming.length ? (
            <ul className="space-y-2" data-testid="client-upcoming">
              {upcoming.map((b) => (
                <li key={b.id}>{card(b)}</li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed p-4 text-muted-foreground">Nothing booked.</p>
          )}
        </section>

        <section aria-labelledby="past-heading" className="space-y-3">
          <h2 id="past-heading" className="text-h3 font-bold">
            Past <span className="text-base text-muted-foreground">({past.length})</span>
          </h2>
          {past.length ? (
            <ul className="space-y-2" data-testid="client-past">
              {(showAll ? past : past.slice(0, PAST_SHOWN)).map((b) => (
                <li key={b.id}>{card(b)}</li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed p-4 text-muted-foreground">No past bookings.</p>
          )}
          {!showAll && past.length > PAST_SHOWN ? (
            <Link href={allHref} className="inline-flex min-h-11 items-center text-link underline underline-offset-4 hover:no-underline">
              Show all {past.length}
            </Link>
          ) : null}
        </section>
      </div>
    </BookingsProvider>
  );
}

function ClientSkeleton() {
  return (
    <div className="space-y-6">
      <LoadingLabel>Loading the client…</LoadingLabel>
      <Skeleton className="h-6 w-36" />
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-11 w-80" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-18" />
        ))}
      </div>
      <Skeleton className="h-24" />
    </div>
  );
}

export default function Page(props: PageProps<"/dashboard/clients/[id]">) {
  return (
    <Suspense fallback={<ClientSkeleton />}>
      <ClientPage {...props} />
    </Suspense>
  );
}
