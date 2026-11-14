import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { AlertsOffer } from "@/components/dashboard/push";
import { vapidKeys } from "@/lib/push/server";
import { ChevronRight } from "lucide-react";
import { BookingCard, NewBookingButtons } from "@/components/dashboard/booking-card";
import { BookingsProvider } from "@/components/dashboard/bookings-provider";
import { LoadingLabel, Skeleton } from "@/components/dashboard/skeleton";
import { TodaySchedule } from "@/components/dashboard/today-schedule";
import { requireStaff } from "@/lib/auth/staff";
import { loadToday } from "@/lib/dashboard/bookings";
import { withDates } from "@/lib/dashboard/types";
import { firstName } from "@/lib/domain/messages";
import { formatPence } from "@/lib/domain/money";
import { isManager } from "@/lib/domain/team";
import { formatDayLong } from "@/lib/domain/time";
import { greeting, needsClosing, nextUp, requestFlags, sortRequests, todayStats, untilLabel } from "@/lib/domain/today";

export const metadata: Metadata = { title: "Today" };

function Section({ id, title, count, children }: { id?: string; title: string; count?: number; children: ReactNode }) {
  const headingId = `${id ?? title.toLowerCase().replace(/\W+/g, "-")}-heading`;
  return (
    <section id={id} aria-labelledby={headingId} className="scroll-mt-20">
      <h2 id={headingId} className="mb-3 flex items-baseline gap-2 text-h3 font-bold">
        {title}
        {count !== undefined ? <span className="text-base font-semibold text-muted-foreground">({count})</span> : null}
      </h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed p-4 text-muted-foreground">{children}</p>;
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-xl border bg-card p-3 sm:p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1">
        <span className="price text-h3">{value}</span>
        {detail ? <span className="block text-sm text-muted-foreground">{detail}</span> : null}
      </dd>
    </div>
  );
}

async function Today() {
  const staff = await requireStaff();
  const data = await loadToday(staff);
  const now = new Date(data.now);
  const manager = isManager(staff);

  const todays = data.todays.map(withDates);
  const stats = todayStats(todays, now);
  const live = data.requestClientsLive.map((b) => ({ ...b, endsAt: new Date(b.endsAt) }));
  const requests = sortRequests(data.requests.map(withDates));
  const closing = needsClosing(data.needsClosing.map(withDates), now);
  const upNext = nextUp(todays, now);
  const byId = new Map([...data.todays, ...data.requests, ...data.needsClosing].map((b) => [b.id, b]));

  return (
    <BookingsProvider setup={data.setup} today={data.today}>
      <div className="space-y-8">
        <div>
          <h1 className="text-h2 font-extrabold" data-testid="greeting">
            {greeting(now)}, {firstName(staff.displayName)}
          </h1>
          <p className="mt-1 text-muted-foreground">{formatDayLong(data.today)}</p>
          <NewBookingButtons date={data.today} className="mt-4" />
        </div>

        <AlertsOffer pushKey={vapidKeys()?.publicKey ?? null} />

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="today-stats">
          <Stat label="Bookings today" value={String(stats.bookings)} />
          <Stat
            label={manager ? "Shop takings" : "Your takings"}
            value={formatPence(stats.takenPence)}
            detail={`of ${formatPence(stats.expectedPence)} expected`}
          />
          <Stat label="Still to come" value={String(stats.upcoming)} />
          <div className="rounded-xl border bg-card">
            <dt className="sr-only">Due back</dt>
            <dd>
              <Link
                href="/dashboard/clients?filter=due_back"
                className="flex h-full min-h-full items-center justify-between gap-2 rounded-xl p-3 hover:bg-muted sm:p-4"
                data-testid="due-back"
              >
                <span>
                  <span className="block text-sm text-muted-foreground">Due back</span>
                  <span className="price mt-1 block text-h3">{data.dueBack}</span>
                  <span className="block text-sm text-muted-foreground">{data.dueBack === 1 ? "client" : "clients"} to invite</span>
                </span>
                <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
              </Link>
            </dd>
          </div>
        </dl>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-2 lg:items-start">
          <div className="space-y-8">
            <Section id="requests" title="Requests" count={requests.length}>
              {requests.length ? (
                <ul className="space-y-2" data-testid="requests">
                  {requests.map((b) => (
                    <li key={b.id}>
                      <BookingCard booking={byId.get(b.id)!} today={data.today} now={data.now} showDay flags={requestFlags(b, live, now)} />
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>No requests waiting.</Empty>
              )}
            </Section>

            {closing.length ? (
              <Section id="needs-closing" title="Needs closing" count={closing.length}>
                <p className="-mt-1 mb-3 text-sm text-muted-foreground">Finished, but not marked Done or No-show yet.</p>
                <ul className="space-y-2" data-testid="needs-closing">
                  {closing.map((b) => (
                    <li key={b.id}>
                      <BookingCard booking={byId.get(b.id)!} today={data.today} now={data.now} showDay />
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}
          </div>

          <div className="space-y-8">
            <Section id="next-up" title="Next up">
              {upNext.length ? (
                <ul className="space-y-2" data-testid="next-up">
                  {upNext.map((b) => (
                    <li key={b.id}>
                      <BookingCard booking={byId.get(b.id)!} today={data.today} now={data.now} note={untilLabel(b, now)} />
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>Nothing else booked today.</Empty>
              )}
            </Section>

            <Section id="schedule" title="Today's schedule">
              <TodaySchedule bookings={data.todays} barbers={data.barbers} now={data.now} today={data.today} />
            </Section>
          </div>
        </div>
      </div>
    </BookingsProvider>
  );
}

function TodaySkeleton() {
  return (
    <div className="space-y-8">
      <LoadingLabel>Loading today…</LoadingLabel>
      <div className="space-y-2">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-5 w-44" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="grid gap-8 lg:grid-cols-2">
        {[0, 1].map((col) => (
          <div key={col} className="space-y-3">
            <Skeleton className="h-7 w-36" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TodayPage() {
  return (
    <Suspense fallback={<TodaySkeleton />}>
      <Today />
    </Suspense>
  );
}
