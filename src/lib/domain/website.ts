/** Website content rules (spec §8.7, owner decision Nov 2026). Mirrors app.gallery_limit() in SQL. */

export type PhotoSet = "slideshow" | "recent_cuts";

/** Most visible photos per section. Hidden photos don't count. */
export const PHOTO_LIMITS: Record<PhotoSet, number> = { slideshow: 3, recent_cuts: 4 };

export const PHOTO_SET_LABELS: Record<PhotoSet, string> = { slideshow: "Slideshow", recent_cuts: "Recent cuts" };

export const photoSet = (inHero: boolean): PhotoSet => (inHero ? "slideshow" : "recent_cuts");

/** "2 of 3" meter text and whether the set is full. */
export function photoMeter(set: PhotoSet, visibleCount: number) {
  const limit = PHOTO_LIMITS[set];
  return { label: `${Math.min(visibleCount, limit)} of ${limit}`, full: visibleCount >= limit };
}

/** Alt text is required: 1–160 characters, whitespace collapsed. */
export function cleanAlt(alt: string): string | null {
  const v = alt.replace(/\s+/g, " ").trim();
  return v.length >= 1 && v.length <= 160 ? v : null;
}
