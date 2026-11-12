import { Suspense } from "react";
import { requireStaff } from "@/lib/auth/staff";
import type { Role } from "@/lib/domain/team";
import { PageSkeleton } from "./skeleton";

async function Guarded({ roles, title, children }: { roles?: readonly Role[]; title: string; children: string }) {
  await requireStaff(roles);
  return (
    <div className="max-w-xl">
      <h1 className="text-h2 font-extrabold">{title}</h1>
      <p className="mt-3 text-muted-foreground" data-testid="coming-soon">
        {children}
      </p>
    </div>
  );
}

/**
 * Stand-in for a dashboard area that a later phase builds. Keeps the same role guard the real page will have,
 * so navigation and permissions can be tested now.
 */
export function ComingSoon({ roles, title, children = "This section is being built." }: { roles?: readonly Role[]; title: string; children?: string }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Guarded roles={roles} title={title}>
        {children}
      </Guarded>
    </Suspense>
  );
}
