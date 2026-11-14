import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Shown inside the shell for unknown addresses and for pages this person's role can't open. */
export default function DashboardNotFound() {
  return (
    <div className="max-w-xl py-6">
      <h1 className="text-title font-extrabold">Page not found</h1>
      <p className="mt-3 text-muted-foreground">This page doesn&apos;t exist, or your account can&apos;t open it.</p>
      <Link href="/dashboard" className={cn(buttonVariants({ variant: "outline" }), "mt-6")}>
        Back to Today
      </Link>
    </div>
  );
}
