import { STATUS_LABELS, type BookingStatus } from "@/lib/domain/today";
import { cn } from "@/lib/utils";

/** Chip colours per status (both themes pass AA; see docs/design-brief.md). Status is never colour alone. */
export const STATUS_STYLES: Record<BookingStatus, { chip: string; edge: string }> = {
  pending: { chip: "bg-status-request text-status-request-foreground", edge: "border-l-status-request-foreground" },
  confirmed: { chip: "bg-status-confirmed text-status-confirmed-foreground", edge: "border-l-status-confirmed-foreground" },
  completed: { chip: "bg-status-done text-status-done-foreground", edge: "border-l-status-done-foreground" },
  no_show: { chip: "bg-status-noshow text-status-noshow-foreground", edge: "border-l-status-noshow-foreground" },
  cancelled: { chip: "bg-status-cancelled text-status-cancelled-foreground", edge: "border-l-status-cancelled-foreground" },
  declined: { chip: "bg-status-cancelled text-status-cancelled-foreground", edge: "border-l-status-cancelled-foreground" },
};

export function StatusChip({ status, className }: { status: BookingStatus; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", STATUS_STYLES[status].chip, className)}>
      {STATUS_LABELS[status]}
    </span>
  );
}

/** Small neutral or warning chip for flags ("Expired", "Changed by customer", "Walk-in"). */
export function FlagChip({ children, tone = "neutral" }: { children: string; tone?: "neutral" | "warning" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        tone === "warning" ? "border-destructive text-destructive" : "border-input text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}
