import "server-only";
import { cacheLife } from "next/cache";
import type { BrandTheme } from "@/lib/templates/document";
import { renderDocument } from "@/lib/templates/render";
import { buildStarter, getStarterMeta } from "@/lib/templates/starters";

/**
 * The HTML preview of one starter in one brand, for the gallery thumbnails.
 *
 * WHY CACHED: rendering MJML takes real CPU time, and the gallery shows 20+
 * starters. With "use cache", each (starter id + brand theme) pair is rendered
 * once and then reused across requests. The theme is an argument, so it is
 * part of the cache key: when a workspace changes its brand kit, the theme
 * changes and fresh previews are rendered automatically (the old entries just
 * expire). Starters only change when we deploy, and a deploy clears this cache.
 *
 * Only brand values go in (no user or contact data), so sharing the cached
 * result between workspaces with identical brands is safe.
 */
export async function renderStarterPreview(starterId: string, theme: BrandTheme): Promise<string | null> {
  "use cache";
  cacheLife("days");

  const meta = getStarterMeta(starterId);
  const document = meta ? buildStarter(meta.id, theme) : null;
  if (!meta || !document) return null;
  const { html } = await renderDocument(document, { subject: meta.subject, preheader: meta.preheader });
  return html;
}
