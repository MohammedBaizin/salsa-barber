"use client";

import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Dashboard errors show inside the shell, so the tabs still work. */
export default function DashboardError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="max-w-xl py-6" role="alert">
      <h1 className="text-title font-extrabold">Something went wrong</h1>
      <p className="mt-3 text-muted-foreground">
        This page didn&apos;t load. Check your connection and try again. Nothing you saved has been lost.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button variant="pop" onClick={() => retry()}>
          <RotateCcw aria-hidden />
          Try again
        </Button>
        <Link href="/dashboard" className={cn(buttonVariants({ variant: "outline" }))}>
          Back to Today
        </Link>
      </div>
    </div>
  );
}
