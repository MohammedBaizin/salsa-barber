import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/** Public pages only: never the dashboard, sign-in, the API or customers' private booking pages (spec §4.1). */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/dashboard", "/login", "/api", "/booking"] },
    sitemap: `${siteUrl()}/sitemap.xml`,
    host: siteUrl(),
  };
}
