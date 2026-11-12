import { groupWeeklyHours, type WeeklyHours } from "@/lib/domain/hours";
import { cn } from "@/lib/utils";

/** Weekly hours grouped ("Mon–Fri 9:00am–6:30pm"). */
export function OpeningHours({ hours, className }: { hours: WeeklyHours; className?: string }) {
  const rows = groupWeeklyHours(hours);
  return (
    <dl className={cn("grid grid-cols-[auto_1fr] gap-x-6 gap-y-2", className)}>
      {rows.map((r) => (
        <div key={r.days} className="contents">
          <dt className="font-semibold">{r.days}</dt>
          <dd className={cn("tabular-nums", r.closed && "text-muted-foreground")}>{r.hours}</dd>
        </div>
      ))}
    </dl>
  );
}
