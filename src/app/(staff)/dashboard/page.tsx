import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { AlertsOffer } from "@/components/dashboard/push";
import { backupReminder } from "@/lib/domain/backup";
import { vapidKeys } from "@/lib/push/server";
import { createSessionClient } from "@/lib/supabase/server";
import { CalendarClock, ChevronRight, Hourglass, PoundSterling, UserRoundCheck, type LucideIcon } from "lucide-react";
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
      <h2 id={headingId} className="mb-4 flex items-center gap-2.5 font-heading text-xl font-bold tracking-tight">
        {title}
        {count !== undefined ? (
          <span className="inline-flex min-w-7 items-center justify-center rounded-full bg-muted px-2 py-0.5 text-sm font-semibold text-muted-foreground">
            <span aria-hidden>{count}</span>
            <span className="sr-only">({count})</span>
          </span>
        ) : null}
      </h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-dashed bg-card/50 px-5 py-6 text-center text-muted-foreground">{children}</p>;
}

const statCard = "rounded-3xl border bg-card p-4 shadow-[var(--shadow-soft)] sm:p-5";

function StatIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span aria-hidden className="mb-3 inline-flex size-9 items-center justify-center rounded-xl bg-primary/15 text-link">
      <Icon className="size-[1.125rem]" />
    </span>
  );
}

function Stat({ label, value, detail, icon }: { label: string; value: string; detail?: string; icon: LucideIcon }) {
  return (
    <div className={statCard}>
      <StatIcon icon={icon} />
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">
        <span className="price block text-[1.75rem] leading-tight">{value}</span>
        {detail ? <span className="block text-sm text-muted-foreground">{detail}</span> : null}
      </dd>
    </div>
  );
}

/** Admins only: a reminder when there's been no backup download for a week. */
async function BackupReminder({ now }: { now: Date }) {
  const supabase = await createSessionClient();
  const { data } = await supabase.from("audit_log").select("at").eq("action", "backup.download").order("id", { ascending: false }).limit(1).maybeSingle();
  const text = backupReminder(data ? new Date(data.at) : null, now);
  if (!text) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border-2 border-status-request-foreground bg-status-request p-4 text-status-request-foreground" data-testid="backup-reminder">
      <span className="font-semibold">{text}</span>
      <Link href="/dashboard/backup" className="font-semibold underline underline-offset-4 hover:no-underline">
        Go to Backup
      </Link>
    </p>
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
        <div className="dark relative isolate overflow-hidden rounded-3xl border border-border bg-background p-6 text-foreground sm:p-8">
          <div aria-hidden className="glow-spot absolute -top-32 -right-24 -z-10 size-96" />
          <div aria-hidden className="dot-grid absolute inset-0 -z-20 opacity-40 [mask-image:linear-gradient(to_left,black,transparent_70%)]" />
          <p className="eyebrow">{formatDayLong(data.today)}</p>
          <h1 className="mt-3 text-title font-extrabold" data-testid="greeting">
            {greeting(now)}, {firstName(staff.displayName)}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {requests.length
              ? `${requests.length} ${requests.length === 1 ? "request is" : "requests are"} waiting for an answer.`
              : "No requests waiting. Add a walk-in or a phone booking below."}
          </p>
          <NewBookingButtons date={data.today} className="mt-5" />
        </div>

        {staff.role === "admin" ? <BackupReminder now={now} /> : null}
        <AlertsOffer pushKey={vapidKeys()?.publicKey ?? null} />

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="today-stats">
          <Stat icon={CalendarClock} label="Bookings today" value={String(stats.bookings)} />
          <Stat
            icon={PoundSterling}
            label={manager ? "Shop takings" : "Your takings"}
            value={formatPence(stats.takenPence)}
            detail={`of ${formatPence(stats.expectedPence)} expected`}
          />
          <Stat icon={Hourglass} label="Still to come" value={String(stats.upcoming)} />
          <div className="rounded-3xl border bg-card shadow-[var(--shadow-soft)] transition-colors hover:border-primary/60">
            <dt className="sr-only">Due back</dt>
            <dd>
              <Link
                href="/dashboard/clients?filter=due_back"
                className="flex h-full min-h-full items-end justify-between gap-2 rounded-3xl p-4 sm:p-5"
                data-testid="due-back"
              >
                <span>
                  <StatIcon icon={UserRoundCheck} />
                  <span className="block text-sm text-muted-foreground">Due back</span>
                  <span className="price mt-0.5 block text-[1.75rem] leading-tight">{data.dueBack}</span>
                  <span className="block text-sm text-muted-foreground">{data.dueBack === 1 ? "client" : "clients"} to invite</span>
                </span>
                <ChevronRight aria-hidden className="mb-1 size-5 shrink-0 text-muted-foreground" />
              </Link>
            </dd>
          </div>
        </dl>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-2 lg:items-start lg:gap-8">
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
      <Skeleton className="h-52 rounded-3xl" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-36 rounded-3xl" />
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
