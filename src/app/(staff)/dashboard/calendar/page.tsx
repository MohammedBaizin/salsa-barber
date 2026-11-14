import type { Metadata } from "next";
import { Suspense, type CSSProperties } from "react";
import { BookingCard, NewBookingButtons } from "@/components/dashboard/booking-card";
import { BookingsProvider } from "@/components/dashboard/bookings-provider";
import { CalendarControls } from "@/components/dashboard/calendar-controls";
import { LoadingLabel, Skeleton } from "@/components/dashboard/skeleton";
import { requireStaff } from "@/lib/auth/staff";
import { loadCalendar } from "@/lib/dashboard/bookings";
import { withDates, type DashboardBooking } from "@/lib/dashboard/types";
import { barberColumns, countByDay, groupByDay, parseCalendarParams, visibleStatuses } from "@/lib/domain/calendar";
import { isManager } from "@/lib/domain/team";
import { dateKey, formatDayLong, formatRelativeDay } from "@/lib/domain/time";

export const metadata: Metadata = { title: "Calendar" };

function Empty({ children }: { children: string }) {
  return <p className="rounded-xl border border-dashed p-4 text-muted-foreground">{children}</p>;
}

async function Calendar({ searchParams }: { searchParams: PageProps<"/dashboard/calendar">["searchParams"] }) {
  const staff = await requireStaff();
  const today = dateKey(new Date());
  const params = parseCalendarParams(await searchParams, today);
  const data = await loadCalendar(staff, params);
  const manager = isManager(staff);
  const shown = visibleStatuses(params.all);

  const counts = Object.fromEntries(countByDay(data.week.map(withDates), params.all));
  const day = data.week.filter((b) => dateKey(new Date(b.startsAt)) === params.date && shown.includes(b.status));
  const filterBarbers = manager ? data.setup.barbers.map(({ id, name }) => ({ id, name })) : [];
  const columns = manager && !params.barber ? barberColumns(filterBarbers, day) : null;
  const card = (b: DashboardBooking, showDay = false) => (
    <BookingCard booking={b} today={data.today} now={data.now} showDay={showDay} showBarber={!params.barber && manager} />
  );
  const relative = formatRelativeDay(params.date, data.today);

  return (
    <BookingsProvider setup={data.setup} today={data.today}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-title font-extrabold">Calendar</h1>
          <NewBookingButtons date={params.view === "day" ? params.date : data.today} />
        </div>

        <CalendarControls params={params} today={data.today} counts={counts} barbers={filterBarbers}>
          {params.view === "day" ? (
            <section aria-labelledby="day-heading" className="space-y-3">
              <h2 id="day-heading" className="text-h3 font-bold">
                {/^(Today|Tomorrow|Yesterday)$/.test(relative) ? `${relative}, ` : ""}
                {formatDayLong(params.date)}
              </h2>
              {day.length === 0 ? (
                <Empty>No bookings on this day.</Empty>
              ) : columns && columns.length > 1 ? (
                // Phones: one list. Desktop: a column per barber (same cards, placed with CSS grid).
                <ol
                  data-testid="day-list"
                  className="flex flex-col gap-2 lg:grid lg:grid-flow-row-dense lg:grid-cols-[repeat(var(--cols),minmax(0,1fr))] lg:gap-3"
                  style={{ "--cols": columns.length } as CSSProperties}
                >
                  {columns.map((c, i) => (
                    <li
                      key={`h-${c.id}`}
                      aria-hidden
                      className="hidden border-b pb-1 font-semibold lg:block lg:[grid-column:var(--col)] lg:[grid-row:1]"
                      style={{ "--col": i + 1 } as CSSProperties}
                    >
                      {c.name}
                    </li>
                  ))}
                  {day.map((b) => (
                    <li
                      key={b.id}
                      className="lg:[grid-column:var(--col)]"
                      style={{ "--col": columns.findIndex((c) => c.id === b.staffId) + 1 } as CSSProperties}
                    >
                      {card(b)}
                    </li>
                  ))}
                </ol>
              ) : (
                <ol data-testid="day-list" className="space-y-2">
                  {day.map((b) => (
                    <li key={b.id}>{card(b)}</li>
                  ))}
                </ol>
              )}
            </section>
          ) : (
            <section aria-label="Upcoming bookings" className="space-y-6" data-testid="upcoming">
              {data.upcoming.length === 0 ? (
                <Empty>Nothing booked from now on.</Empty>
              ) : (
                groupByDay(data.upcoming.map((b) => ({ ...b, startsAt: new Date(b.startsAt), raw: b }))).map((g) => {
                  const rel = formatRelativeDay(g.day, data.today);
                  return (
                    <div key={g.day} className="space-y-2">
                      <h2 className="text-lg font-bold">
                        {/^(Today|Tomorrow)$/.test(rel) ? `${rel}, ` : ""}
                        {formatDayLong(g.day)}
                        <span className="ml-2 text-sm font-semibold text-muted-foreground">({g.bookings.length})</span>
                      </h2>
                      <ol className="space-y-2">
                        {g.bookings.map((b) => (
                          <li key={b.id}>{card(b.raw)}</li>
                        ))}
                      </ol>
                    </div>
                  );
                })
              )}
            </section>
          )}
        </CalendarControls>
      </div>
    </BookingsProvider>
  );
}

function CalendarSkeleton() {
  return (
    <div className="space-y-5">
      <LoadingLabel>Loading the calendar…</LoadingLabel>
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-11 w-72" />
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
      <div className="space-y-2">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    </div>
  );
}

/** Built in phase 7. */
export default function CalendarPage({ searchParams }: PageProps<"/dashboard/calendar">) {
  return (
    <Suspense fallback={<CalendarSkeleton />}>
      <Calendar searchParams={searchParams} />
    </Suspense>
  );
}
