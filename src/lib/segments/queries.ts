import "server-only";
import { db } from "@/lib/db";

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
