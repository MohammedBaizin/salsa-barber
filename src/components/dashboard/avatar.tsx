import { initials } from "@/lib/domain/team";
import { cn } from "@/lib/utils";

/**
 * Team photo, or initials when there's none. Decorative: the name is always shown next to it.
 * `size` takes size and shape classes (e.g. "size-16 rounded-2xl"); round by default.
 */
export function Avatar({ member, size = "size-12" }: { member: { name: string; photoUrl: string | null }; size?: string }) {
  return member.photoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- small team photos from Supabase Storage
    <img src={member.photoUrl} alt="" className={cn("shrink-0 rounded-full border object-cover", size)} />
  ) : (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-[color-mix(in_oklab,var(--primary),black_25%)] font-bold text-primary-foreground",
        size,
      )}
    >
      {initials(member.name)}
    </span>
  );
}
