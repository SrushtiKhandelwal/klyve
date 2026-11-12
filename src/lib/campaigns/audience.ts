// Who a campaign goes to. Stored as JSON in Campaign.audience.
// Safe to import from server AND client.
//
// Rule: (everyone in ANY chosen list or segment)
//       minus (everyone in ANY excluded list or segment)
//       minus (anyone not SUBSCRIBED)          ← always, no exceptions
// Duplicates are removed: a person in two chosen lists gets ONE email.
import { z } from "zod";

const id = z.string().min(1).max(40);
const ids = z.array(id).max(20).default([]);

export const audienceSchema = z.object({
  listIds: ids,
  segmentIds: ids,
  excludeListIds: ids,
  excludeSegmentIds: ids,
});
export type Audience = z.infer<typeof audienceSchema>;

export const EMPTY_AUDIENCE: Audience = { listIds: [], segmentIds: [], excludeListIds: [], excludeSegmentIds: [] };

/** Reads Campaign.audience safely (bad/old data → empty audience). */
export function readAudience(json: unknown): Audience {
  const parsed = audienceSchema.safeParse(json ?? {});
  return parsed.success ? parsed.data : EMPTY_AUDIENCE;
}

export function audienceIsEmpty(a: Audience): boolean {
  return a.listIds.length === 0 && a.segmentIds.length === 0;
}
