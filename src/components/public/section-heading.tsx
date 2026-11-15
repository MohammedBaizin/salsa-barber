import { cn } from "@/lib/utils";

/**
 * Section heading: a small numbered eyebrow ("01 · Prices"), a big title in one style,
 * an optional intro and an optional action on the right (desktop).
 */
export function SectionHeading({
  id,
  title,
  eyebrow,
  intro,
  action,
  className,
}: {
  id: string;
  title: string;
  eyebrow?: string;
  intro?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-10 flex flex-col gap-6 md:mb-14 md:flex-row md:items-end md:justify-between", className)}>
      <div className="max-w-3xl">
        {eyebrow && <p className="eyebrow mb-4">{eyebrow}</p>}
        <h2 id={id} className="text-h2 font-extrabold">
          {title}
        </h2>
        {intro && <p className="mt-5 max-w-xl text-lead text-muted-foreground">{intro}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
