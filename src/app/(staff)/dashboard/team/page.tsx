import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronRight } from "lucide-react";
import { Avatar } from "@/components/dashboard/avatar";
import { LoadingLabel, Skeleton } from "@/components/dashboard/skeleton";
import { AddPersonButton } from "@/components/dashboard/team-forms";
import { requireStaff } from "@/lib/auth/staff";
import { loadTeam } from "@/lib/dashboard/team";
import { ROLE_LABELS } from "@/lib/domain/team";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Team" };

/** A small status: coloured dot + text. */
function Status({ on, children, tone = "on" }: { on: boolean; children: string; tone?: "on" | "off" }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", on ? "text-foreground" : "text-muted-foreground")}>
      <span
        aria-hidden
        className={cn("size-1.5 rounded-full", tone === "off" ? "bg-destructive" : on ? "bg-status-done-foreground" : "bg-muted-foreground/40")}
      />
      {children}
    </span>
  );
}

async function Team({ searchParams }: { searchParams: PageProps<"/dashboard/team">["searchParams"] }) {
  const staff = await requireStaff(["owner", "admin"]);
  const [{ members, creatable }, search] = await Promise.all([loadTeam(staff), searchParams]);
  const working = members.filter((m) => m.active && m.bookable).length;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">The chairs</p>
          <h1 className="mt-2 text-title font-extrabold">Team</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {members.length} {members.length === 1 ? "person" : "people"} · {working} taking bookings
          </p>
        </div>
        <AddPersonButton roles={creatable} />
      </div>
      {search.deleted === "1" ? (
        <p role="status" className="rounded-2xl border border-status-done-foreground/40 bg-status-done px-4 py-3 font-medium text-status-done-foreground">
          Account deleted.
        </p>
      ) : null}
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="team-list">
        {members.map((m) => (
          <li key={m.id} className="min-w-0">
            <Link
              href={`/dashboard/team/${m.id}`}
              className={cn(
                "group flex h-full items-center gap-4 rounded-3xl border bg-card p-4 shadow-[var(--shadow-soft)] transition-[border-color,translate] duration-200 hover:-translate-y-0.5 hover:border-primary/50",
                !m.active && "border-dashed bg-muted/40",
              )}
              data-testid="team-row"
            >
              <Avatar member={m} size="size-16 rounded-2xl text-lg" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate font-heading text-lg font-bold tracking-tight">{m.name}</span>
                  {m.id === staff.id ? (
                    <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[0.6875rem] font-semibold text-link">You</span>
                  ) : null}
                </span>
                <span className="block truncate text-sm text-muted-foreground">
                  {ROLE_LABELS[m.role]}
                  {m.title && m.title !== ROLE_LABELS[m.role] ? ` · ${m.title}` : ""}
                </span>
                <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                  {!m.active ? (
                    <Status on tone="off">
                      Switched off
                    </Status>
                  ) : m.role === "admin" ? (
                    <Status on={false}>Not on the website</Status>
                  ) : (
                    <>
                      <Status on={m.bookable}>{m.bookable ? "Takes bookings" : "No bookings"}</Status>
                      <Status on={m.showOnSite}>{m.showOnSite ? "On the website" : "Hidden"}</Status>
                    </>
                  )}
                </span>
              </span>
              <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TeamSkeleton() {
  return (
    <div className="space-y-6">
      <LoadingLabel>Loading the team…</LoadingLabel>
      <Skeleton className="h-16 w-48" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 rounded-3xl" />
        ))}
      </div>
    </div>
  );
}

export default function TeamPage({ searchParams }: PageProps<"/dashboard/team">) {
  return (
    <Suspense fallback={<TeamSkeleton />}>
      <Team searchParams={searchParams} />
    </Suspense>
  );
}
