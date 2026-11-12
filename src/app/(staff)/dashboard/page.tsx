import type { Metadata } from "next";
import { Suspense } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireStaff } from "@/lib/auth/staff";
import { ROLE_LABELS } from "@/lib/domain/team";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

/** Placeholder until the dashboard shell and Today screen (phase 6). */
async function SignedIn() {
  const staff = await requireStaff();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h2 font-extrabold">Hi {staff.displayName}</h1>
        <p className="mt-1 text-muted-foreground" data-testid="signed-in-as">
          Signed in as {staff.username} · {ROLE_LABELS[staff.role]}
        </p>
      </div>
      <p className="text-sm text-muted-foreground">The dashboard is being built. Today, Calendar and Clients come next.</p>
      <form action="/auth/signout" method="post">
        <Button type="submit" variant="outline">
          <LogOut aria-hidden />
          Sign out
        </Button>
      </form>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-[max(2rem,env(safe-area-inset-top))]">
      <Suspense fallback={<div className="h-40" aria-hidden />}>
        <SignedIn />
      </Suspense>
    </main>
  );
}
