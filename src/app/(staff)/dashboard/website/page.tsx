import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ExternalLink } from "lucide-react";
import { LoadingLabel, Skeleton } from "@/components/dashboard/skeleton";
import { PhotoSetCard, ReviewsCard, ShopPhotoCard, type GalleryPhoto } from "@/components/dashboard/website-board";
import { requireStaff } from "@/lib/auth/staff";
import { photoSet, PHOTO_SETS, type PhotoSet } from "@/lib/domain/website";
import { storageUrl } from "@/lib/site-content";
import { createSessionClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Website" };

async function Website() {
  await requireStaff(["owner", "admin"]);
  const supabase = await createSessionClient();
  const [settings, photos, reviews] = await Promise.all([
    supabase.from("settings").select("shop_photo_path").eq("id", 1).single(),
    supabase.from("gallery_photos").select("id, path, alt, visible, in_hero, sort").order("sort").order("created_at"),
    supabase.from("reviews").select("id, author_name, body, stars, review_date, is_google, visible, sort").order("sort").order("created_at"),
  ]);
  for (const r of [settings, photos, reviews]) if (r.error) throw new Error(`Couldn't load website content: ${r.error.message}`);

  const gallery: GalleryPhoto[] = photos.data!.map((p) => ({
    id: p.id,
    url: storageUrl("gallery", p.path),
    alt: p.alt,
    visible: p.visible,
    set: photoSet(p.in_hero),
  }));
  const visibleIn = Object.fromEntries(PHOTO_SETS.map((s) => [s, gallery.filter((p) => p.set === s && p.visible).length])) as Record<PhotoSet, number>;
  const shopPath = settings.data!.shop_photo_path;

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-h2 font-extrabold">Website</h1>
        <Link href="/" target="_blank" className="inline-flex min-h-11 items-center gap-2 text-link underline underline-offset-4 hover:no-underline">
          View the website
          <ExternalLink aria-hidden className="size-4" />
          <span className="sr-only">(opens in a new tab)</span>
        </Link>
      </div>
      <p className="text-muted-foreground">
        Only upload photos customers have agreed to. Photos are made smaller, turned upright and have location details removed before they&apos;re saved.
      </p>
      <ShopPhotoCard key={shopPath ?? "none"} url={shopPath ? storageUrl("gallery", shopPath) : null} />
      {PHOTO_SETS.map((set) => (
        <PhotoSetCard key={set} set={set} photos={gallery.filter((p) => p.set === set)} visibleIn={visibleIn} />
      ))}
      <ReviewsCard
        reviews={reviews.data!.map((r) => ({
          id: r.id,
          authorName: r.author_name,
          body: r.body,
          stars: r.stars,
          reviewDate: r.review_date,
          isGoogle: r.is_google,
          visible: r.visible,
        }))}
      />
    </div>
  );
}

function WebsiteSkeleton() {
  return (
    <div className="max-w-2xl space-y-5">
      <LoadingLabel>Loading website content…</LoadingLabel>
      <Skeleton className="h-10 w-40" />
      <Skeleton className="h-72" />
      <Skeleton className="h-96" />
    </div>
  );
}

/** Built in phase 12. */
export default function WebsitePage() {
  return (
    <Suspense fallback={<WebsiteSkeleton />}>
      <Website />
    </Suspense>
  );
}
