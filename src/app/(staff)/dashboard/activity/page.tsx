import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ChevronDown, Filter } from "lucide-react";
import { AutoSubmitSelect } from "@/components/dashboard/auto-submit-select";
import { LoadingLabel, Skeleton } from "@/components/dashboard/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { requireStaff } from "@/lib/auth/staff";
import { loadActivity } from "@/lib/dashboard/activity";
import { ACTIVITY_TYPES, actionLabel, activityHref, entryDetail, groupByDay, parseActivityParams } from "@/lib/domain/activity";
import { dateKey, formatRelativeDay, formatTime } from "@/lib/domain/time";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Activity" };

async function Activity({ searchParams }: { searchParams: PageProps<"/dashboard/activity">["searchParams"] }) {
  await requireStaff(["owner", "admin"]);
  const p = parseActivityParams(await searchParams);
  const data = await loadActivity(p);
  await connection();
  const today = dateKey(new Date());
  const days = groupByDay(data.entries.map((e) => ({ ...e, at: new Date(e.at) })));
  const filtered = Boolean(p.person || p.type);

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-title font-extrabold">Activity</h1>
        <p className="mt-1 text-muted-foreground">Changes made in the dashboard over the last 90 days. Sign-ins and page views aren&apos;t logged.</p>
      </div>

      <Form action="/dashboard/activity" className="flex flex-wrap items-end gap-3" aria-label="Filter activity">
        <div className="min-w-0 flex-[1_1_12rem] space-y-1.5">
          <Label htmlFor="activity-person">Person</Label>
          <AutoSubmitSelect
            id="activity-person"
            name="person"
            defaultValue={p.person ?? ""}
            options={[{ value: "", label: "Everyone" }, ...data.people.map((s) => ({ value: s.id, label: s.label }))]}
          />
        </div>
        <div className="min-w-0 flex-[1_1_12rem] space-y-1.5">
          <Label htmlFor="activity-type">Type</Label>
          <AutoSubmitSelect
            id="activity-type"
            name="type"
            defaultValue={p.type ?? ""}
            options={[{ value: "", label: "Everything" }, ...ACTIVITY_TYPES.map((t) => ({ value: t.value, label: t.label }))]}
          />
        </div>
        <button type="submit" className={cn(buttonVariants({ variant: "outline" }))}>
          <Filter aria-hidden />
          Show
        </button>
      </Form>

      {p.before ? (
        <Link href={activityHref({ ...p, before: null })} className="inline-flex min-h-11 items-center text-link underline underline-offset-4 hover:no-underline">
          Back to the newest
        </Link>
      ) : null}

      {days.length ? (
        <div className="space-y-6" data-testid="activity">
          {days.map((day) => (
            <section key={day.date} aria-labelledby={`day-${day.date}`}>
              <h2 id={`day-${day.date}`} className="mb-2 text-sm font-bold tracking-wide text-muted-foreground uppercase">
                {formatRelativeDay(day.date, today)}
              </h2>
              <ol className="divide-y rounded-2xl border bg-card shadow-[var(--shadow-soft)]">
                {day.entries.map((e) => {
                  const detail = entryDetail(e);
                  return (
                    <li key={e.id} className="flex gap-3 px-3 py-2.5 sm:px-4" data-testid="activity-entry">
                      <time dateTime={e.at.toISOString()} className="w-16 shrink-0 pt-0.5 text-sm text-muted-foreground tabular-nums">
                        {formatTime(e.at)}
                      </time>
                      <div className="min-w-0 flex-1">
                        <p>
                          <span className="font-semibold">{actionLabel(e.action)}</span>
                          <span className="text-muted-foreground"> by {e.actorName}</span>
                        </p>
                        {detail ? <p className="text-sm break-words text-muted-foreground">{detail}</p> : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed p-4 text-muted-foreground">
          {filtered ? "Nothing matches. Try another person or type." : "Nothing has been changed yet."}
        </p>
      )}

      {data.older ? (
        <Link href={activityHref({ ...p, before: data.older })} className={cn(buttonVariants({ variant: "outline" }))}>
          <ChevronDown aria-hidden />
          Show older
        </Link>
      ) : null}
    </div>
  );
}

function ActivitySkeleton() {
  return (
    <div className="max-w-3xl space-y-5">
      <LoadingLabel>Loading activity…</LoadingLabel>
      <Skeleton className="h-10 w-40" />
      <Skeleton className="h-16" />
      <Skeleton className="h-96" />
    </div>
  );
}

/** Built in phase 11. */
export default function ActivityPage({ searchParams }: PageProps<"/dashboard/activity">) {
  return (
    <Suspense fallback={<ActivitySkeleton />}>
      <Activity searchParams={searchParams} />
    </Suspense>
  );
}
