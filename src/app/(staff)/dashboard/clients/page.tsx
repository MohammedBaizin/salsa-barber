import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { AutoSubmitSelect } from "@/components/dashboard/auto-submit-select";
import { ClientLabelChip } from "@/components/dashboard/client-label";
import { LoadingLabel, Skeleton } from "@/components/dashboard/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireStaff } from "@/lib/auth/staff";
import { loadClientList, type ClientListRow } from "@/lib/dashboard/clients";
import {
  CLIENT_FILTERS, clientLabels, clientsHref, CLIENTS_PER_PAGE, pageSummary, parseClientParams,
} from "@/lib/domain/clients";
import { formatUkMobile } from "@/lib/domain/phone";
import { isManager } from "@/lib/domain/team";
import { dateKey, formatRelativeDay } from "@/lib/domain/time";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Clients" };

function ClientRow({ row, now, today, weeks, back }: { row: ClientListRow; now: Date; today: string; weeks: number; back: string }) {
  const last = row.lastVisit ? new Date(row.lastVisit) : null;
  const next = row.nextVisit ? new Date(row.nextVisit) : null;
  const labels = clientLabels({ visits: row.visits, lastVisit: last, nextVisit: next }, now, weeks);
  const meta = [
    row.visits === 1 ? "1 visit" : `${row.visits} visits`,
    last ? `last ${formatRelativeDay(dateKey(last), today)}` : null,
    next ? `next ${formatRelativeDay(dateKey(next), today)}` : null,
  ].filter(Boolean);
  return (
    <li>
      <Link
        href={`/dashboard/clients/${row.id}?back=${encodeURIComponent(back)}`}
        className="flex items-center gap-3 rounded-2xl border bg-card shadow-[var(--shadow-soft)] p-3 hover:bg-muted sm:p-4"
        data-testid="client-row"
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate font-bold">{row.name}</span>
            {labels.map((l) => (
              <ClientLabelChip key={l} label={l} />
            ))}
          </span>
          <span className="mt-0.5 block text-sm text-muted-foreground">
            {formatUkMobile(row.phone)} · {meta.join(" · ")}
          </span>
        </span>
        <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  );
}

async function Clients({ searchParams }: { searchParams: PageProps<"/dashboard/clients">["searchParams"] }) {
  const staff = await requireStaff();
  const search = await searchParams;
  const p = parseClientParams(search);
  const data = await loadClientList(staff, p);
  const now = new Date(data.now);
  const today = dateKey(now);
  const manager = isManager(staff);
  const total = data.counts[p.filter];
  const pages = Math.max(1, Math.ceil(total / CLIENTS_PER_PAGE));
  const current = clientsHref(p);

  return (
    <div className="space-y-5">
      <h1 className="text-title font-extrabold">Clients</h1>
      {search.deleted === "1" ? (
        <p role="status" className="rounded-lg border border-status-done-foreground bg-status-done px-3 py-2 font-medium text-status-done-foreground">
          Client deleted.
        </p>
      ) : null}

      <Form action="/dashboard/clients" role="search" className="flex flex-wrap items-end gap-3">
        {p.filter !== "all" ? <input type="hidden" name="filter" value={p.filter} /> : null}
        <div className="min-w-0 flex-[1_1_16rem] space-y-1.5">
          <Label htmlFor="client-search">Search by name or number</Label>
          <Input id="client-search" name="q" type="search" defaultValue={p.q} autoComplete="off" enterKeyHint="search" />
        </div>
        {manager && data.barbers.length > 1 ? (
          <div className="space-y-1.5">
            <Label htmlFor="client-barber">Clients of</Label>
            <AutoSubmitSelect
              id="client-barber"
              name="barber"
              defaultValue={p.barber ?? ""}
              options={[{ value: "", label: "Everyone" }, ...data.barbers.map((b) => ({ value: b.id, label: b.name }))]}
            />
          </div>
        ) : null}
        <button type="submit" className={cn(buttonVariants({ variant: "ink" }))}>
          <Search aria-hidden />
          Search
        </button>
      </Form>

      <nav aria-label="Show" className="flex flex-wrap gap-2">
        {CLIENT_FILTERS.map((f) => (
          <Link
            key={f.value}
            href={clientsHref({ ...p, filter: f.value, page: 1 })}
            aria-current={p.filter === f.value ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 px-4 text-sm font-semibold",
              p.filter === f.value ? "border-foreground bg-secondary text-secondary-foreground" : "border-input hover:bg-muted",
            )}
          >
            {f.label}
            <span className="tabular-nums opacity-80">({data.counts[f.value]})</span>
          </Link>
        ))}
      </nav>

      <p className="text-sm text-muted-foreground" data-testid="client-summary">
        {pageSummary(p.page, total)}
        {p.q ? ` for “${p.q}”` : ""}
      </p>

      {data.rows.length ? (
        <ul className="space-y-2" data-testid="client-list">
          {data.rows.map((row) => (
            <ClientRow key={row.id} row={row} now={now} today={today} weeks={data.dueBackWeeks} back={current} />
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed p-4 text-muted-foreground">
          {p.q || p.barber || p.filter !== "all"
            ? "No clients match. Try a different search or filter."
            : "No clients yet. They're added when someone books."}
        </p>
      )}

      {pages > 1 ? (
        <nav aria-label="Pages" className="flex items-center justify-between gap-3">
          {p.page > 1 ? (
            <Link href={clientsHref({ ...p, page: p.page - 1 })} className={cn(buttonVariants({ variant: "outline" }))}>
              <ChevronLeft aria-hidden />
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-muted-foreground">
            Page {Math.min(p.page, pages)} of {pages}
          </span>
          {p.page < pages ? (
            <Link href={clientsHref({ ...p, page: p.page + 1 })} className={cn(buttonVariants({ variant: "outline" }))}>
              Next
              <ChevronRight aria-hidden />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}

function ClientsSkeleton() {
  return (
    <div className="space-y-5">
      <LoadingLabel>Loading clients…</LoadingLabel>
      <Skeleton className="h-10 w-40" />
      <Skeleton className="h-16" />
      <Skeleton className="h-11 w-80" />
      {[0, 1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-18" />
      ))}
    </div>
  );
}

/** Built in phase 8. */
export default function ClientsPage({ searchParams }: PageProps<"/dashboard/clients">) {
  return (
    <Suspense fallback={<ClientsSkeleton />}>
      <Clients searchParams={searchParams} />
    </Suspense>
  );
}
