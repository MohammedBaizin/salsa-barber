import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/** The two public pages (spec §4.1). */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/book`, changeFrequency: "weekly", priority: 0.8 },
  ];
}
