import "server-only";
import { getAppUrl } from "@/lib/app-url";
import { db } from "@/lib/db";
import { addUtmParams, UTM_DEFAULTS, UTM_VALUE_RE, utmCampaignSlug, type UtmSettings, type UtmTags } from "@/lib/tracking/utm";

// Reads the workspace's UTM settings and applies them to an email's HTML.
// The pure link logic is in utm.ts; this file only adds the database and the
// app's own address (so links back to this app are left alone).

/** The workspace's UTM settings. Pass a workspace id the caller already checked. */
export async function getUtmSettings(workspaceId: string): Promise<UtmSettings> {
  const row = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { utmEnabled: true, utmSource: true, utmMedium: true },
  });
  if (!row) return UTM_DEFAULTS;
  return {
    enabled: row.utmEnabled,
    // Values are validated when saved; fall back to the defaults if not.
    source: UTM_VALUE_RE.test(row.utmSource) ? row.utmSource : UTM_DEFAULTS.source,
    medium: UTM_VALUE_RE.test(row.utmMedium) ? row.utmMedium : UTM_DEFAULTS.medium,
  };
}

/** The tags for one campaign, or null when UTM tags are switched off. */
export async function getCampaignUtmTags(workspaceId: string, campaignName: string): Promise<UtmTags | null> {
  const settings = await getUtmSettings(workspaceId);
  if (!settings.enabled) return null;
  return { source: settings.source, medium: settings.medium, campaign: utmCampaignSlug(campaignName) };
}

/** Adds the tags to the HTML (no change when `tags` is null). */
export function applyUtmTags(html: string, tags: UtmTags | null): string {
  return tags ? addUtmParams(html, tags, { appUrl: getAppUrl() }) : html;
}
