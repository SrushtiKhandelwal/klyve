import type { MetadataRoute } from "next";
import { getAppUrl } from "@/lib/app-url";

// /sitemap.xml: the public pages we want in Google, so it finds them quickly.
// Add a line here when you add a new public page.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = getAppUrl();
  const page = (path: string, priority: number, changeFrequency: "weekly" | "monthly" | "yearly") => ({
    url: `${base}${path}`,
    changeFrequency,
    priority,
  });

  return [
    page("/", 1, "weekly"),
    page("/signup", 0.8, "monthly"),
    page("/docs/api", 0.7, "monthly"),
    page("/login", 0.5, "yearly"),
    page("/privacy", 0.3, "yearly"),
    page("/terms", 0.3, "yearly"),
  ];
}
