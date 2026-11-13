import "server-only";
import { db } from "@/lib/db";
import { ENGAGEMENT_CAMPAIGN_STATUSES } from "@/lib/segments/engine";

// Read helpers for saved segments. They take a workspaceId, so ONLY pass the
// id from requireActiveWorkspace(), never one from the browser.

export type SegmentSummaryRow = {
  id: string;
  name: string;
  rules: unknown;
  updatedAt: Date;
};

/** All saved segments in the workspace, most recently changed first. */
export async function listSegments(workspaceId: string): Promise<SegmentSummaryRow[]> {
  return db.segment.findMany({
    where: { workspaceId },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    select: { id: true, name: true, rules: true, updatedAt: true },
  });
}

/** A campaign the "Email activity" conditions can point at. */
export type SegmentCampaignOption = {
  id: string;
  name: string;
  /** When sending started (ISO text, so it can be passed to the browser). */
  sentAt: string | null;
};

/**
 * Campaigns that went out (or are going out), newest first, for the campaign
 * picker in the rule builder and for naming campaigns in segment summaries.
 * Same statuses validateRulesForWorkspace accepts.
 */
export async function listSegmentCampaignOptions(workspaceId: string): Promise<SegmentCampaignOption[]> {
  const rows = await db.campaign.findMany({
    where: { workspaceId, kind: "REGULAR", status: { in: [...ENGAGEMENT_CAMPAIGN_STATUSES] } },
    orderBy: [{ startedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    select: { id: true, name: true, startedAt: true },
    // Plenty for a picker; very old campaigns are rarely targeted.
    take: 1000,
  });
  return rows.map((r) => ({ id: r.id, name: r.name, sentAt: r.startedAt?.toISOString() ?? null }));
}

/**
 * One segment, or null if it doesn't exist OR belongs to another workspace
 * (we answer the same way in both cases so ids can't be probed).
 */
export async function getSegment(workspaceId: string, segmentId: string) {
  if (typeof segmentId !== "string" || segmentId.length === 0 || segmentId.length > 64) return null;
  return db.segment.findFirst({
    where: { id: segmentId, workspaceId },
    select: { id: true, name: true, rules: true, createdAt: true, updatedAt: true },
  });
}
