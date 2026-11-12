"use client";

import Link from "next/link";
import { Phone, RotateCcw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";

export default function PublicError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="mx-auto max-w-xl px-4 py-20 text-center">
      <h1 className="text-h1 font-extrabold">Something went wrong</h1>
      <p className="mt-4 text-lead text-muted-foreground">Sorry, this page didn&apos;t load. Please try again, or give us a call.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button variant="pop" size="lg" onClick={reset}>
          <RotateCcw aria-hidden />
          Try again
        </Button>
        <Link href="/" className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>
          Home
        </Link>
        <a href={`tel:${site.phone.e164}`} className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>
          <Phone aria-hidden />
          Call
        </a>
      </div>
    </main>
  );
}
