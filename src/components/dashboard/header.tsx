import Link from "next/link";
import { Bell, LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { requireStaff } from "@/lib/auth/staff";
import { pendingCount } from "@/lib/dashboard/bookings";
import { initials, ROLE_LABELS } from "@/lib/domain/team";
import { Skeleton } from "./skeleton";

const iconButton =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-border/80 bg-card/60 transition-colors hover:border-foreground/40 hover:bg-muted";

/** Header contents: who is signed in, the requests bell, theme toggle and sign out. Reads the session. */
export async function HeaderBar() {
  const staff = await requireStaff();
  const waiting = await pendingCount();
  return (
    <>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span
          aria-hidden
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primary font-heading text-sm font-extrabold text-primary-foreground"
        >
          {initials(staff.displayName)}
        </span>
        <p className="min-w-0 truncate leading-tight font-semibold" data-testid="signed-in-as">
          {staff.displayName} <span className="font-normal text-muted-foreground">· {ROLE_LABELS[staff.role]}</span>
        </p>
      </div>
      <Link
        href="/dashboard#requests"
        className={`${iconButton} relative`}
        aria-label={waiting === 1 ? "Requests: 1 waiting" : `Requests: ${waiting} waiting`}
        data-testid="requests-bell"
      >
        <Bell aria-hidden className="size-5" />
        {waiting > 0 ? (
          <span
            aria-hidden
            className="absolute top-1 right-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-bold text-primary-foreground ring-2 ring-background"
          >
            {waiting > 99 ? "99+" : waiting}
          </span>
        ) : null}
      </Link>
      <ThemeToggle area="dashboard" className={iconButton} />
      <form action="/auth/signout" method="post">
        <button type="submit" className={iconButton}>
          <LogOut aria-hidden className="size-5" />
          <span className="sr-only">Sign out</span>
        </button>
      </form>
    </>
  );
}

export function HeaderSkeleton() {
  return (
    <>
      <Skeleton className="size-10 flex-none rounded-full" />
      <Skeleton className="h-5 w-40 flex-none" />
      <span className="flex-1" />
      <Skeleton className="size-9 rounded-full" />
      <Skeleton className="size-9 rounded-full" />
      <Skeleton className="size-9 rounded-full" />
    </>
  );
}
