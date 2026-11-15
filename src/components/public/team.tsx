import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { initials } from "@/lib/domain/team";
import type { SiteContent } from "@/lib/site-content";
import { SectionHeading } from "./section-heading";
import { SectionDivider } from "./section-divider";

/** Barbers shown on the website, as portrait cards. Titles never reveal who the owner is (the role isn't public). */
export function Team({ team }: Pick<SiteContent, "team">) {
  if (team.length === 0) return null;
  return (
    <section aria-labelledby="team-title" id="team" className="scroll-mt-20">
      <SectionDivider className="mt-10 sm:mt-14" />
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <SectionHeading id="team-title" eyebrow="The chairs" title="The team" />
        <ul className="reveal grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
          {team.map((m) => (
            <li key={m.id} className="group flex flex-col overflow-hidden rounded-3xl border border-border bg-card">
              <div className="dark relative aspect-[4/5] overflow-hidden bg-background">
                {m.photo ? (
                  <Image
                    src={m.photo.url}
                    alt=""
                    fill
                    sizes="(min-width: 1024px) 400px, (min-width: 640px) 50vw, 100vw"
                    className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04] motion-reduce:transition-none"
                  />
                ) : (
                  <>
                    <div aria-hidden className="dot-grid absolute inset-0 opacity-50" />
                    <div aria-hidden className="glow-spot absolute inset-0" />
                    <span aria-hidden className="absolute inset-0 flex items-center justify-center font-heading text-[7rem] font-extrabold tracking-tighter text-primary">
                      {initials(m.name)}
                    </span>
                  </>
                )}
                <div aria-hidden className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-5">
                  <h3 className="text-h3 font-extrabold text-white">{m.name}</h3>
                  {m.title && <p className="mt-0.5 text-sm text-white/85">{m.title}</p>}
                </div>
              </div>
              {(m.bio || m.bookable) && (
                <div className="flex flex-1 flex-col gap-4 p-5">
                  {m.bio && <p className="text-muted-foreground">{m.bio}</p>}
                  {m.bookable && (
                    <Link
                      href={`/book?barber=${m.id}`}
                      className="mt-auto inline-flex min-h-11 items-center justify-between gap-2 rounded-full border border-border px-5 font-semibold transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground"
                    >
                      Book with {m.name}
                      <ArrowUpRight aria-hidden className="size-4" />
                    </Link>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
