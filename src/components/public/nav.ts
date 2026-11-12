import type { SiteContent } from "@/lib/site-content";

export type NavLink = { href: string; label: string };

/** Section links for the header and phone menu: only sections that have content. */
export function sectionLinks(content: SiteContent): NavLink[] {
  const links: NavLink[] = [];
  if (content.services.length) links.push({ href: "/#services", label: "Prices" });
  if (content.recentCuts.length) links.push({ href: "/#cuts", label: "Cuts" });
  if (content.team.length) links.push({ href: "/#team", label: "Team" });
  if (content.reviews.length || content.googleRating != null) links.push({ href: "/#reviews", label: "Reviews" });
  links.push({ href: "/#visit", label: "Visit" });
  return links;
}
