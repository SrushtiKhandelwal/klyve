import "server-only";
import { cacheLife } from "next/cache";
import type { BrandTheme } from "@/lib/templates/document";
import { personalize } from "@/lib/templates/personalize";
import { renderDocument } from "@/lib/templates/render";
import { previewMergeData } from "@/lib/templates/sample-data";
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
  const rendered = await renderDocument(document, { subject: meta.subject, preheader: meta.preheader });
  return withSampleData(rendered.html, rendered.text, meta.subject);
}

/**
 * Fills the merge tags with the sample contact ("Welcome, Priya!"), so a
 * thumbnail looks like a real email instead of showing {{ contact.FIRSTNAME }}.
 * If a tag can't be filled for some reason, the raw HTML is still shown.
 */
function withSampleData(html: string, text: string, subject: string): string {
  try {
    return personalize({ html, text, subject }, previewMergeData([])).html;
  } catch {
    return html;
  }
}
