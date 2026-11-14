import type { MetadataRoute } from "next";
import { getAppUrl } from "@/lib/app-url";
import { PRIVATE_PATHS } from "@/lib/seo";

// /robots.txt: lets search engines read the public pages and keeps them out
// of the logged-in app and the per-person pages linked from emails.
export default function robots(): MetadataRoute.Robots {
  const base = getAppUrl();
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: PRIVATE_PATHS }],
    sitemap: `${base}/sitemap.xml`,
  };
}
