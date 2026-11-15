import { Scissors } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Decorative break at the top of each home page section: two hairlines that fade out towards the edges, meeting at a
 * small round badge with gold scissors. Purely visual, so hidden from screen readers.
 */
export function SectionDivider({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("mx-auto flex max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8", className)}>
      <span className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-primary/50" />
      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-card shadow-[0_8px_24px_-12px_var(--glow)]">
        <Scissors className="size-4 -rotate-90 text-primary" />
      </span>
      <span className="h-px flex-1 bg-gradient-to-l from-transparent via-border to-primary/50" />
    </div>
  );
}
