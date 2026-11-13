/** Website content rules (spec §8.7, owner decision Nov 2026). Mirrors app.gallery_limit() in SQL. */
import { z } from "zod";

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

export const PHOTO_SETS: PhotoSet[] = ["slideshow", "recent_cuts"];
export const isPhotoSet = (v: unknown): v is PhotoSet => v === "slideshow" || v === "recent_cuts";

export const ALT_ERROR = "Please describe the photo (up to 160 characters), e.g. “Skin fade with a sharp line-up”.";

/** "Slideshow already shows 3 photos. Hide one first, or add this one hidden." */
export function setFullMessage(set: PhotoSet): string {
  return `${PHOTO_SET_LABELS[set]} already shows ${PHOTO_LIMITS[set]} photos. Hide one first.`;
}

/** Shown before adding to (or moving into) a full set: the photo goes in hidden. */
export function addsHiddenNote(set: PhotoSet): string {
  return `${PHOTO_SET_LABELS[set]} is full (${PHOTO_LIMITS[set]} of ${PHOTO_LIMITS[set]}), so this photo will be added hidden. Hide another photo to show it.`;
}

/**
 * Whether a new (or moved) photo can be shown: not if the set is full, and children's photos always start
 * hidden until a parent has agreed (spec §12).
 */
export function startsVisible(opts: { set: PhotoSet; visibleInSet: number; child: boolean }): boolean {
  return !opts.child && opts.visibleInSet < PHOTO_LIMITS[opts.set];
}

const oneLine = (max: number, message: string) =>
  z.string().transform((v) => v.replace(/\s+/g, " ").trim()).pipe(z.string().min(1, message).max(max, message));

/** Reviews (spec §8.7): copied word for word; the date is optional and never in the future. */
export const reviewSchema = z.object({
  authorName: oneLine(80, "Please enter the reviewer's name (up to 80 characters)."),
  body: z
    .string()
    .transform((v) => v.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim())
    .pipe(z.string().min(1, "Please paste the review text.").max(2000, "Please keep the review under 2,000 characters.")),
  stars: z.coerce.number().int().min(1, "Choose 1 to 5 stars.").max(5, "Choose 1 to 5 stars."),
  reviewDate: z
    .string()
    .optional()
    .transform((v) => v?.trim() || null)
    .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Choose a date."),
  isGoogle: z.preprocess((v) => v === "on" || v === "1", z.boolean()),
  visible: z.preprocess((v) => v === "on" || v === "1", z.boolean()),
});

export type ReviewInput = z.output<typeof reviewSchema>;
