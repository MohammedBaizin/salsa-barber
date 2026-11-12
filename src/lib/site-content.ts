import { cacheLife, cacheTag } from "next/cache";
import type { WeeklyHours } from "@/lib/domain/hours";
import type { PublicTheme } from "@/lib/theme";
import { site } from "@/lib/site";
import { supabaseUrl } from "@/lib/supabase/env";
import { createPublicClient } from "@/lib/supabase/public";

/**
 * Everything the public website shows, read with the anon key (RLS: public content only).
 * Cached ('use cache', tag "site-content", refreshed hourly); every dashboard edit to public content
 * calls updateTag("site-content"). Never reads the clock: time-dependent bits run in the browser.
 */

export type SitePhoto = { url: string; alt: string };

export type SiteContent = {
  shopHours: WeeklyHours;
  googleRating: number | null;
  googleReviewCount: number | null;
  googleReviewUrl: string | null;
  walkInText: string | null;
  discountText: string | null;
  shopPhoto: SitePhoto | null;
  services: { id: string; name: string; pricePence: number; durationMin: number; bookableDays: number[] | null }[];
  team: { id: string; name: string; title: string | null; bio: string | null; photo: SitePhoto | null; bookable: boolean }[];
  slideshow: SitePhoto[];
  recentCuts: SitePhoto[];
  reviews: { id: string; author: string; body: string; stars: number; date: string | null; isGoogle: boolean }[];
  /** All closed days (the browser shows the upcoming ones). */
  closures: { date: string; reason: string | null }[];
};

export function storageUrl(bucket: "gallery" | "team", path: string): string {
  return `${supabaseUrl()}/storage/v1/object/public/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export async function getSiteContent(): Promise<SiteContent> {
  "use cache";
  cacheTag("site-content");
  cacheLife("hours");

  const db = createPublicClient();
  const [settings, services, team, photos, reviews, closures] = await Promise.all([
    db
      .from("settings")
      .select("shop_hours, google_rating, google_review_count, google_review_url, walk_in_text, discount_text, shop_photo_path")
      .eq("id", 1)
      .single(),
    db.from("services").select("id, name, price_pence, duration_min, bookable_days, sort").order("sort").order("name"),
    db.from("public_team").select("id, display_name, title, bio, photo_path, bookable, show_on_site, sort").order("sort"),
    db.from("gallery_photos").select("path, alt, in_hero, sort").order("sort"),
    db.from("reviews").select("id, author_name, body, stars, review_date, is_google, sort").order("sort").order("review_date", { ascending: false }),
    db.from("closures").select("closed_on, reason").order("closed_on"),
  ]);

  for (const r of [settings, services, team, photos, reviews, closures]) {
    if (r.error) throw new Error(`Couldn't load website content: ${r.error.message}`);
  }
  const s = settings.data!;
  const photo = (bucket: "gallery" | "team", path: string, alt: string): SitePhoto => ({ url: storageUrl(bucket, path), alt });

  return {
    shopHours: (s.shop_hours ?? {}) as WeeklyHours,
    googleRating: s.google_rating,
    googleReviewCount: s.google_review_count,
    googleReviewUrl: s.google_review_url,
    walkInText: s.walk_in_text,
    discountText: s.discount_text,
    shopPhoto: s.shop_photo_path ? photo("gallery", s.shop_photo_path, `${site.name} shopfront`) : null,
    services: services.data!.map((v) => ({
      id: v.id,
      name: v.name,
      pricePence: v.price_pence,
      durationMin: v.duration_min,
      bookableDays: v.bookable_days,
    })),
    team: team
      .data!.filter((t) => t.show_on_site && t.id && t.display_name)
      .map((t) => ({
        id: t.id!,
        name: t.display_name!,
        title: t.title,
        bio: t.bio,
        photo: t.photo_path ? photo("team", t.photo_path, t.display_name!) : null,
        bookable: Boolean(t.bookable),
      })),
    slideshow: photos.data!.filter((p) => p.in_hero).slice(0, 3).map((p) => photo("gallery", p.path, p.alt)),
    recentCuts: photos.data!.filter((p) => !p.in_hero).slice(0, 4).map((p) => photo("gallery", p.path, p.alt)),
    reviews: reviews.data!.map((r) => ({
      id: r.id,
      author: r.author_name,
      body: r.body,
      stars: r.stars,
      date: r.review_date,
      isGoogle: r.is_google,
    })),
    closures: closures.data!.map((c) => ({ date: c.closed_on, reason: c.reason })),
  };
}

/** The shop's default website theme for new visitors (Settings). Cached so the root layout stays prerendered. */
export async function getPublicTheme(): Promise<PublicTheme> {
  "use cache";
  cacheTag("site-content");
  cacheLife("hours");
  try {
    const { data } = await createPublicClient().from("settings").select("public_theme").eq("id", 1).single();
    return data?.public_theme === "light" ? "light" : data?.public_theme === "dark" ? "dark" : site.defaultPublicTheme;
  } catch {
    return site.defaultPublicTheme;
  }
}
