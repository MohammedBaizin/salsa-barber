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

export const metadata: Metadata = { title: "Team" };

function Chip({ children, tone = "neutral" }: { children: string; tone?: "neutral" | "off" }) {
  return (
    <span
      className={
        tone === "off"
          ? "inline-flex rounded-full bg-status-cancelled px-2 py-0.5 text-xs font-semibold text-status-cancelled-foreground"
          : "inline-flex rounded-full border border-input px-2 py-0.5 text-xs font-medium text-muted-foreground"
      }
    >
      {children}
    </span>
  );
}

async function Team({ searchParams }: { searchParams: PageProps<"/dashboard/team">["searchParams"] }) {
  const staff = await requireStaff(["owner", "admin"]);
  const [{ members, creatable }, search] = await Promise.all([loadTeam(staff), searchParams]);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-h2 font-extrabold">Team</h1>
        <AddPersonButton roles={creatable} />
      </div>
      {search.deleted === "1" ? (
        <p role="status" className="rounded-lg border border-status-done-foreground bg-status-done px-3 py-2 font-medium text-status-done-foreground">
          Account deleted.
        </p>
      ) : null}
      <ul className="space-y-2" data-testid="team-list">
        {members.map((m) => (
          <li key={m.id}>
            <Link href={`/dashboard/team/${m.id}`} className="flex items-center gap-3 rounded-xl border bg-card p-3 hover:bg-muted sm:p-4" data-testid="team-row">
              <Avatar member={m} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{m.name}</span>
                <span className="block text-sm text-muted-foreground">
                  {ROLE_LABELS[m.role]}
                  {m.title && m.title !== ROLE_LABELS[m.role] ? ` · ${m.title}` : ""}
                  {m.id === staff.id ? " · you" : ""}
                </span>
                <span className="mt-1 flex flex-wrap gap-1.5">
                  {!m.active ? <Chip tone="off">Switched off</Chip> : null}
                  {m.active && m.bookable ? <Chip>Takes bookings</Chip> : null}
                  {m.active && m.showOnSite ? <Chip>On the website</Chip> : null}
                  {m.active && m.role !== "admin" && !m.bookable && !m.showOnSite ? <Chip>Hidden</Chip> : null}
                </span>
              </span>
              <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TeamSkeleton() {
  return (
    <div className="space-y-5">
      <LoadingLabel>Loading the team…</LoadingLabel>
      <Skeleton className="h-10 w-40" />
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-20" />
      ))}
    </div>
  );
}

/** Built in phase 9. */
export default function TeamPage({ searchParams }: PageProps<"/dashboard/team">) {
  return (
    <Suspense fallback={<TeamSkeleton />}>
      <Team searchParams={searchParams} />
    </Suspense>
  );
}
