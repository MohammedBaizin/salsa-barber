import { initials } from "@/lib/domain/team";

/** Team photo, or initials when there's none. Decorative: the name is always shown next to it. */
export function Avatar({ member, size = "size-12" }: { member: { name: string; photoUrl: string | null }; size?: string }) {
  return member.photoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- small team photos from Supabase Storage
    <img src={member.photoUrl} alt="" className={`${size} shrink-0 rounded-full border object-cover`} />
  ) : (
    <span aria-hidden className={`${size} inline-flex shrink-0 items-center justify-center rounded-full bg-muted font-bold`}>
      {initials(member.name)}
    </span>
  );
}
