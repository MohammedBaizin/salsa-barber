import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

export default function NotFound() {
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center px-4 py-16 text-center">
      <Image src="/brand/badge-disc-160.webp" alt="" width={96} height={96} className="size-24" />
      <h1 className="mt-6 text-h1 font-extrabold">Page not found</h1>
      <p className="mt-3 max-w-md text-lead text-muted-foreground">That page doesn&apos;t exist. It may have moved, or the link may be wrong.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/" className={cn(buttonVariants({ variant: "pop", size: "lg" }))}>
          Go to {site.name}
        </Link>
        <a href={`tel:${site.phone.e164}`} className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>
          Call {site.phone.display}
        </a>
      </div>
    </main>
  );
}
