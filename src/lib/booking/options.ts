import { cacheLife, cacheTag } from "next/cache";
import { storageUrl, type SitePhoto } from "@/lib/site-content";
import { createPublicClient } from "@/lib/supabase/public";

export type BookingService = { id: string; name: string; pricePence: number; durationMin: number; bookableDays: number[] | null };
export type BookingBarber = { id: string; name: string; title: string | null; photo: SitePhoto | null; serviceIds: string[] };
export type BookingOptions = { services: BookingService[]; barbers: BookingBarber[] };

/**
 * Services and bookable barbers for /book (anon key: public data only). Cached with the site content;
 * dashboard edits call updateTag("site-content"). Free times come from /api/availability, never from here.
 */
export async function getBookingOptions(): Promise<BookingOptions> {
  "use cache";
  cacheTag("site-content");
  cacheLife("hours");

  const db = createPublicClient();
  const [services, team, links] = await Promise.all([
    db.from("services").select("id, name, price_pence, duration_min, bookable_days").order("sort").order("name"),
    db.from("public_team").select("id, display_name, title, photo_path, bookable, sort").order("sort"),
    db.from("staff_services").select("staff_id, service_id"),
  ]);
  for (const r of [services, team, links]) if (r.error) throw new Error(`Couldn't load booking options: ${r.error.message}`);

  const barbers = team
    .data!.filter((t) => t.bookable && t.id && t.display_name)
    .map((t) => ({
      id: t.id!,
      name: t.display_name!,
      title: t.title,
      photo: t.photo_path ? { url: storageUrl("team", t.photo_path), alt: t.display_name! } : null,
      serviceIds: links.data!.filter((l) => l.staff_id === t.id).map((l) => l.service_id),
    }))
    .filter((b) => b.serviceIds.length > 0);

  const offered = new Set(barbers.flatMap((b) => b.serviceIds));
  return {
    services: services
      .data!.filter((s) => offered.has(s.id))
      .map((s) => ({ id: s.id, name: s.name, pricePence: s.price_pence, durationMin: s.duration_min, bookableDays: s.bookable_days })),
    barbers,
  };
}
