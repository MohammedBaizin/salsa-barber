import Image from "next/image";
import Link from "next/link";
import { initials } from "@/lib/domain/team";
import type { SiteContent } from "@/lib/site-content";
import { SectionHeading } from "./section-heading";

/** Barbers shown on the website. Titles never reveal who the owner is (the role isn't public). */
export function Team({ team }: Pick<SiteContent, "team">) {
  if (team.length === 0) return null;
  return (
    <section aria-labelledby="team-title" id="team" className="scroll-mt-20 border-t">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <SectionHeading id="team-title" title="The team" />
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {team.map((m) => (
            <li key={m.id} className="flex flex-col rounded-2xl border bg-card p-5">
              <div className="flex items-center gap-4">
                {m.photo ? (
                  <Image src={m.photo.url} alt="" width={80} height={80} sizes="80px" className="size-20 rounded-full border-2 border-highlight object-cover" />
                ) : (
                  <span aria-hidden className="inline-flex size-20 items-center justify-center rounded-full bg-highlight font-heading text-2xl font-extrabold text-highlight-foreground">
                    {initials(m.name)}
                  </span>
                )}
                <div>
                  <h3 className="text-h3 font-bold">{m.name}</h3>
                  {m.title && <p className="text-sm text-muted-foreground">{m.title}</p>}
                </div>
              </div>
              {m.bio && <p className="mt-4 text-body">{m.bio}</p>}
              {m.bookable && (
                <Link
                  href={`/book?barber=${m.id}`}
                  className="mt-auto inline-flex min-h-11 items-center pt-4 font-semibold text-link underline underline-offset-4 hover:no-underline"
                >
                  Book with {m.name}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
