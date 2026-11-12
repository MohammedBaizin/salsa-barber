import Link from "next/link";
import { Bell, LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { requireStaff } from "@/lib/auth/staff";
import { pendingCount } from "@/lib/dashboard/bookings";
import { ROLE_LABELS } from "@/lib/domain/team";
import { Skeleton } from "./skeleton";

const iconButton = "inline-flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-muted";

/** Header contents: who is signed in, the requests bell, theme toggle and sign out. Reads the session. */
export async function HeaderBar() {
  const staff = await requireStaff();
  const waiting = await pendingCount();
  return (
    <>
      <p className="min-w-0 flex-1 truncate font-semibold" data-testid="signed-in-as">
        {staff.displayName} <span className="font-normal text-muted-foreground">· {ROLE_LABELS[staff.role]}</span>
      </p>
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
            className="absolute top-1 right-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-bold text-primary-foreground ring-2 ring-sidebar"
          >
            {waiting > 99 ? "99+" : waiting}
          </span>
        ) : null}
      </Link>
      <ThemeToggle area="dashboard" />
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
      <Skeleton className="h-5 w-40 flex-none" />
      <span className="flex-1" />
      <Skeleton className="size-9 rounded-full" />
      <Skeleton className="size-9 rounded-full" />
      <Skeleton className="size-9 rounded-full" />
    </>
  );
}
