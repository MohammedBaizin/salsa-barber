import { cn } from "@/lib/utils";

/** Section title with a short barber-pole stripe underneath. */
export function SectionHeading({ id, title, intro, className }: { id: string; title: string; intro?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-8 max-w-2xl", className)}>
      <h2 id={id} className="text-h2 font-extrabold">
        {title}
      </h2>
      <div aria-hidden className="pole-stripe mt-3 h-1.5 w-16 rounded-full" />
      {intro && <p className="mt-4 text-lead text-muted-foreground">{intro}</p>}
    </div>
  );
}
