import Link from "next/link";
import { ArrowUpRight, Phone } from "lucide-react";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";

const focus = "outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * Book + Call, side by side on one line: a yellow Book pill ending in a round arrow chip, and a glass Call pill starting
 * with a round phone chip. Used in the hero and the phone Book bar, both dark surfaces. Call just says "Call" on phones
 * so both fit; the number shows from the `sm` breakpoint unless `compact` is set.
 */
export function BookCallButtons({ id, compact = false, className }: { id?: string; compact?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Link
        id={id}
        href="/book"
        className={cn(
          "group/book inline-flex h-12 flex-1 items-center justify-between gap-3 rounded-full bg-primary pr-1.5 pl-5 text-[0.9375rem] font-semibold whitespace-nowrap text-primary-foreground shadow-pop transition-[translate,box-shadow,scale] duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-12px_var(--glow)] active:scale-[0.98]",
          !compact && "sm:flex-none",
          focus,
        )}
      >
        Book a cut
        <span aria-hidden className="inline-flex size-9 items-center justify-center rounded-full bg-primary-foreground text-primary transition-transform duration-300 group-hover/book:rotate-45">
          <ArrowUpRight className="size-4" />
        </span>
      </Link>
      <a
        href={`tel:${site.phone.e164}`}
        aria-label={`Call ${site.phone.display}`}
        className={cn(
          "glass group/call inline-flex h-12 shrink-0 items-center gap-2.5 rounded-full border border-white/15 pr-4 pl-1.5 text-[0.9375rem] font-semibold whitespace-nowrap transition-[background-color,border-color,scale] duration-200 hover:border-white/30 hover:bg-white/10 active:scale-[0.98]",
          focus,
        )}
      >
        <span aria-hidden className="inline-flex size-9 items-center justify-center rounded-full bg-white/10 transition-colors group-hover/call:bg-primary group-hover/call:text-primary-foreground">
          <Phone className="size-4" />
        </span>
        <span>
          Call{!compact && <span className="hidden tabular-nums sm:inline"> {site.phone.display}</span>}
        </span>
      </a>
    </div>
  );
}
