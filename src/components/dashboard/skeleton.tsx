import { cn } from "@/lib/utils";

/** Grey placeholder block. Appears only after ~90 ms (see .skeleton-delay), so quick loads don't flash. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton-delay animate-pulse rounded-lg bg-muted", className)} />;
}

/** Screen-reader text for a loading region. */
export function LoadingLabel({ children = "Loading…" }: { children?: string }) {
  return (
    <span role="status" className="sr-only">
      {children}
    </span>
  );
}

/** Generic page skeleton: heading, a row of tiles, a list. */
export function PageSkeleton() {
  return (
    <div className="space-y-6">
      <LoadingLabel />
      <Skeleton className="h-10 w-56" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="hidden h-20 sm:block" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    </div>
  );
}
