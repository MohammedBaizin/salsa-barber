/**
 * Marks content the owner hasn't confirmed yet. Renders only when NEXT_PUBLIC_SHOW_PLACEHOLDERS=true (dev).
 * The smoke test checks that no placeholder tags reach production.
 */
export function PlaceholderTag({ note }: { note?: string }) {
  if (process.env.NEXT_PUBLIC_SHOW_PLACEHOLDERS !== "true") return null;
  return (
    <span
      data-placeholder
      title={note ?? "Needs the owner's confirmation"}
      className="ml-1.5 inline-flex items-center rounded-sm border border-dashed border-current px-1.5 py-0.5 align-middle font-sans text-[0.6875rem] font-semibold tracking-wide text-accent uppercase"
    >
      To confirm
    </span>
  );
}
