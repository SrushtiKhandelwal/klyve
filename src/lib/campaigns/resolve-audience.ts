import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { Audience } from "@/lib/campaigns/audience";
import {
  countSegment,
  getSegmentContactIds,
  loadRulesContext,
  validateRulesForWorkspace,
  type CheckedSegmentRules,
} from "@/lib/segments/engine";
import { MAX_CONDITIONS, type SegmentRules } from "@/lib/segments/rules";
import { notSuppressedSql } from "@/lib/suppression";

// Works out WHO a campaign goes to. This decides who gets an email, so the
// rules are strict:
//
//   (everyone in ANY chosen list or segment)
//   minus (everyone in ANY excluded list or segment)
//   minus (anyone who is not SUBSCRIBED)            ← always
//   minus (anyone on the suppression list)          ← always (Phase 6)
//   minus (anyone from another workspace)           ← always
//   with duplicates removed (one email per person).
//
// HOW IT SCALES (100k+ contacts without loading them all into memory)
// Every source produces contact ids SORTED the same way (byte order,
// `COLLATE "C"`), a page at a time:
//   - all chosen lists together: one keyset-paginated SQL query
//   - each segment: the segment engine's getSegmentContactIds() pages
// Because every stream is sorted, we can merge them like zipping sorted
// card piles: take the smallest id, skip equal ids (= dedupe), and walk the
// excluded-segment streams alongside to drop excluded ids. Memory stays at
// about one page per source (5,000 ids), whatever the audience size.
// Each batch of candidates then goes through ONE final SQL check (same
// workspace, SUBSCRIBED, not in an excluded list), which also loads emails.
//
// Fast path: an audience made only of lists (the common case) needs no
// merging at all; one paginated SQL query does everything.
//
// LIMITS
// - Each page query sorts the matching contacts (there's no index on
//   `id COLLATE "C"`), so very large workspaces (1M+) get slower; an
//   expression index would fix that.
// - The audience is read in several queries, not one snapshot: someone who
//   joins/leaves a list DURING resolution may or may not be included. The
//   final check still guarantees they're SUBSCRIBED and in this workspace.

/** Ids per page when reading a source. */
const PAGE_SIZE = 5_000;

/** Thrown when a chosen list/segment is gone or a segment's rules no longer work. */
export class AudienceError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join(" "));
    this.name = "AudienceError";
  }
}

type NamedSource = { id: string; name: string };
type SegmentSource = NamedSource & { rules: SegmentRules; checked: CheckedSegmentRules };

export type ResolvedSources = {
  lists: NamedSource[];
  excludeLists: NamedSource[];
  segments: SegmentSource[];
  excludeSegments: SegmentSource[];
};

const unique = (ids: string[]) => [...new Set(ids)];

/**
 * Loads the audience's lists and segments, ONLY from this workspace, and
 * checks every segment's rules. Throws AudienceError if anything is missing
 * or broken: silently ignoring a deleted EXCLUDED segment would email people
 * the user meant to leave out.
 */
export async function resolveSources(workspaceId: string, audience: Audience): Promise<ResolvedSources> {
  const listIds = unique([...audience.listIds, ...audience.excludeListIds]);
  const segmentIds = unique([...audience.segmentIds, ...audience.excludeSegmentIds]);

  const [lists, segments, context] = await Promise.all([
    listIds.length
      ? db.contactList.findMany({ where: { workspaceId, id: { in: listIds } }, select: { id: true, name: true } })
      : [],
    segmentIds.length
      ? db.segment.findMany({ where: { workspaceId, id: { in: segmentIds } }, select: { id: true, name: true, rules: true } })
      : [],
    segmentIds.length ? loadRulesContext(workspaceId) : null,
  ]);

  const problems: string[] = [];
  const listById = new Map(lists.map((l) => [l.id, l]));
  const missingLists = listIds.filter((id) => !listById.has(id)).length;
  if (missingLists > 0) {
    problems.push(
      missingLists === 1
        ? "A list in this audience no longer exists (it may have been deleted). Remove it and try again."
        : `${missingLists} lists in this audience no longer exist. Remove them and try again.`,
    );
  }

  const segmentById = new Map<string, SegmentSource>();
  let missingSegments = 0;
  for (const id of segmentIds) {
    const row = segments.find((s) => s.id === id);
    if (!row) {
      missingSegments++;
      continue;
    }
    const checked = await validateRulesForWorkspace(workspaceId, row.rules, context ?? undefined);
    if (!checked.ok) {
      problems.push(`The segment “${row.name}” has rules that no longer work (${checked.errors[0]}). Fix the segment first.`);
      continue;
    }
    segmentById.set(id, { id, name: row.name, rules: checked.rules, checked: checked.checked });
  }
  if (missingSegments > 0) {
    problems.push(
      missingSegments === 1
        ? "A segment in this audience no longer exists (it may have been deleted). Remove it and try again."
        : `${missingSegments} segments in this audience no longer exist. Remove them and try again.`,
    );
  }
  if (problems.length) throw new AudienceError(problems);

  const pickLists = (ids: string[]) => unique(ids).map((id) => listById.get(id)!);
  const pickSegments = (ids: string[]) => unique(ids).map((id) => segmentById.get(id)!);
  return {
    lists: pickLists(audience.listIds),
    excludeLists: pickLists(audience.excludeListIds),
    segments: pickSegments(audience.segmentIds),
    excludeSegments: pickSegments(audience.excludeSegmentIds),
  };
}

// ─────────────────────────────────────────────
// SQL pieces (every value is a bound parameter)
// ─────────────────────────────────────────────

const SUBSCRIBED = Prisma.sql`c.status = 'SUBSCRIBED'::"ContactStatus"`;
/** The address is not on this workspace's suppression list (plain or erased/hashed). */
const NOT_SUPPRESSED = notSuppressedSql("c");

/** "Is in at least one of these lists" (the lists were already checked to be in this workspace). */
function inAnyList(listIds: string[]): Prisma.Sql {
  return Prisma.sql`EXISTS (
    SELECT 1 FROM list_membership lm
    WHERE lm."contactId" = c.id AND lm."listId" IN (${Prisma.join(listIds)})
  )`;
}

function notInExcludedLists(sources: ResolvedSources): Prisma.Sql {
  if (sources.excludeLists.length === 0) return Prisma.empty;
  return Prisma.sql`AND NOT ${inAnyList(sources.excludeLists.map((l) => l.id))}`;
}

/** WHERE clause for the lists-only stream: workspace, subscribed, not suppressed, in a chosen list, not in an excluded one. */
function listsWhere(workspaceId: string, sources: ResolvedSources): Prisma.Sql {
  return Prisma.sql`c."workspaceId" = ${workspaceId}
    AND ${SUBSCRIBED}
    AND ${NOT_SUPPRESSED}
    AND ${inAnyList(sources.lists.map((l) => l.id))}
    ${notInExcludedLists(sources)}`;
}

const afterCursor = (cursor: string | null) => (cursor ? Prisma.sql`AND c.id COLLATE "C" > ${cursor}` : Prisma.empty);

// ─────────────────────────────────────────────
// Sorted id streams and merging
// ─────────────────────────────────────────────

type Page = { ids: string[]; nextCursor: string | null };

/** Something that hands out ids in ascending order, one at a time. */
interface SortedIds {
  /** The next id without consuming it (null = no more). */
  peek(): Promise<string | null>;
  /** Consumes the id `peek()` returned. */
  skip(): Promise<void>;
}

/** Reads a paginated, sorted source page by page. */
class PagedIds implements SortedIds {
  private buffer: string[] = [];
  private pos = 0;
  private cursor: string | null = null;
  private finished = false;
  private last: string | null = null;

  constructor(private readonly fetchPage: (cursor: string | null) => Promise<Page>) {}

  async peek(): Promise<string | null> {
    while (this.pos >= this.buffer.length) {
      if (this.finished) return null;
      const page = await this.fetchPage(this.cursor);
      this.buffer = page.ids;
      this.pos = 0;
      this.cursor = page.nextCursor;
      if (!page.nextCursor) this.finished = true;
    }
    return this.buffer[this.pos];
  }

  async skip(): Promise<void> {
    const id = await this.peek();
    if (id === null) return;
    // Merging is only correct if every source is strictly sorted the same
    // way as JavaScript compares strings. Ids are ASCII cuids, where byte
    // order (COLLATE "C") and JS order agree. If that ever breaks, stop
    // loudly instead of quietly emailing the wrong people.
    if (this.last !== null && !(id > this.last)) throw new Error("Audience ids are not sorted; refusing to continue.");
    this.last = id;
    this.pos++;
  }
}

/** Several sorted streams as one sorted stream without duplicates. */
class UnionIds implements SortedIds {
  constructor(private readonly streams: SortedIds[]) {}

  async peek(): Promise<string | null> {
    let min: string | null = null;
    for (const s of this.streams) {
      const id = await s.peek();
      if (id !== null && (min === null || id < min)) min = id;
    }
    return min;
  }

  async skip(): Promise<void> {
    const min = await this.peek();
    if (min === null) return;
    // Every stream that has this same id moves past it: that's the dedupe.
    for (const s of this.streams) if ((await s.peek()) === min) await s.skip();
  }
}

function segmentStream(workspaceId: string, segment: SegmentSource): SortedIds {
  return new PagedIds((cursor) => getSegmentContactIds(workspaceId, segment.checked, { cursor, take: PAGE_SIZE }));
}

function listsStream(workspaceId: string, sources: ResolvedSources): SortedIds {
  return new PagedIds(async (cursor) => {
    const rows = await db.$queryRaw<{ id: string }[]>`
      SELECT c.id FROM contact c
      WHERE ${listsWhere(workspaceId, sources)} ${afterCursor(cursor)}
      ORDER BY c.id COLLATE "C" ASC
      LIMIT ${PAGE_SIZE}
    `;
    const ids = rows.map((r) => r.id);
    return { ids, nextCursor: ids.length === PAGE_SIZE ? ids[ids.length - 1] : null };
  });
}

/** Candidate ids (before the final check), in batches: included minus excluded segments, deduped. */
async function* candidateBatches(
  workspaceId: string,
  sources: ResolvedSources,
  batchSize: number,
): AsyncGenerator<string[]> {
  const included: SortedIds[] = sources.segments.map((s) => segmentStream(workspaceId, s));
  if (sources.lists.length) included.push(listsStream(workspaceId, sources));
  const include = new UnionIds(included);
  const exclude = new UnionIds(sources.excludeSegments.map((s) => segmentStream(workspaceId, s)));

  let batch: string[] = [];
  for (let id = await include.peek(); id !== null; id = await include.peek()) {
    await include.skip();
    // Move the exclusion stream up to this id; if it's there, leave this person out.
    let ex = await exclude.peek();
    while (ex !== null && ex < id) {
      await exclude.skip();
      ex = await exclude.peek();
    }
    if (ex === id) continue;
    batch.push(id);
    if (batch.length >= batchSize) {
      yield batch;
      batch = [];
    }
  }
  if (batch.length) yield batch;
}

/** The final check for a batch of candidate ids: same workspace, SUBSCRIBED, not suppressed, not in an excluded list. */
function finalCheckWhere(workspaceId: string, sources: ResolvedSources, ids: string[]): Prisma.Sql {
  return Prisma.sql`c.id = ANY(${ids}::text[])
    AND c."workspaceId" = ${workspaceId}
    AND ${SUBSCRIBED}
    AND ${NOT_SUPPRESSED}
    ${notInExcludedLists(sources)}`;
}

const onlyLists = (s: ResolvedSources) => s.segments.length === 0 && s.excludeSegments.length === 0;

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

export type AudienceContact = { id: string; email: string };

/**
 * The FINAL audience (deduped, SUBSCRIBED only, not suppressed, this workspace only), in
 * batches of up to `batchSize` contacts, sorted by id. Throws AudienceError
 * if a list/segment is missing or broken.
 */
export async function* iterateAudienceContacts(
  workspaceId: string,
  audience: Audience,
  batchSize = 1000,
): AsyncGenerator<AudienceContact[]> {
  const size = Math.min(10_000, Math.max(1, Math.floor(batchSize) || 1000));
  if (audience.listIds.length === 0 && audience.segmentIds.length === 0) return;
  const sources = await resolveSources(workspaceId, audience);

  if (onlyLists(sources)) {
    // Fast path: one keyset-paginated query does everything. Pages are
    // fetched big (each query has to sort) and handed out in `size` chunks.
    const fetchSize = Math.max(size, PAGE_SIZE);
    let cursor: string | null = null;
    for (;;) {
      const rows: AudienceContact[] = await db.$queryRaw<AudienceContact[]>`
        SELECT c.id, c.email FROM contact c
        WHERE ${listsWhere(workspaceId, sources)} ${afterCursor(cursor)}
        ORDER BY c.id COLLATE "C" ASC
        LIMIT ${fetchSize}
      `;
      for (let i = 0; i < rows.length; i += size) yield rows.slice(i, i + size);
      if (rows.length < fetchSize) return;
      cursor = rows[rows.length - 1].id;
    }
  }

  for await (const ids of candidateBatches(workspaceId, sources, size)) {
    const rows = await db.$queryRaw<AudienceContact[]>`
      SELECT c.id, c.email FROM contact c
      WHERE ${finalCheckWhere(workspaceId, sources, ids)}
      ORDER BY c.id COLLATE "C" ASC
    `;
    if (rows.length) yield rows;
  }
}

export type AudienceSourceCount = {
  kind: "list" | "segment";
  id: string;
  name: string;
  /** SUBSCRIBED contacts in this source on its own (before dedupe/exclusions). */
  subscribed: number;
};

export type AudienceCount = { recipients: number; perSource: AudienceSourceCount[] };

/**
 * How many people would get the campaign right now, plus each chosen
 * source's own subscribed count. Throws AudienceError if a source is broken.
 */
export async function countAudience(workspaceId: string, audience: Audience): Promise<AudienceCount> {
  if (audience.listIds.length === 0 && audience.segmentIds.length === 0) return { recipients: 0, perSource: [] };
  const sources = await resolveSources(workspaceId, audience);
  const [recipients, perSource] = await Promise.all([
    countRecipients(workspaceId, sources),
    countPerSource(workspaceId, sources),
  ]);
  return { recipients, perSource };
}

async function countRecipients(workspaceId: string, sources: ResolvedSources): Promise<number> {
  if (onlyLists(sources)) {
    const rows = await db.$queryRaw<{ count: number }[]>`
      SELECT count(*)::int AS count FROM contact c WHERE ${listsWhere(workspaceId, sources)}
    `;
    return rows[0]?.count ?? 0;
  }
  let total = 0;
  for await (const ids of candidateBatches(workspaceId, sources, PAGE_SIZE)) {
    const rows = await db.$queryRaw<{ count: number }[]>`
      SELECT count(*)::int AS count FROM contact c WHERE ${finalCheckWhere(workspaceId, sources, ids)}
    `;
    total += rows[0]?.count ?? 0;
  }
  return total;
}

async function countPerSource(workspaceId: string, sources: ResolvedSources): Promise<AudienceSourceCount[]> {
  // Plain SQL GROUP BY: about 10x faster than Prisma's groupBy with relation
  // filters on big lists. (The lists were already checked to be ours.)
  const listCounts = sources.lists.length
    ? await db.$queryRaw<{ listId: string; count: number }[]>`
        SELECT lm."listId" AS "listId", count(*)::int AS count
        FROM list_membership lm
        JOIN contact c ON c.id = lm."contactId"
        WHERE lm."listId" IN (${Prisma.join(sources.lists.map((l) => l.id))})
          AND c."workspaceId" = ${workspaceId} AND ${SUBSCRIBED}
        GROUP BY lm."listId"
      `
    : [];
  const byList = new Map(listCounts.map((r) => [r.listId, r.count]));

  const segmentCounts = await Promise.all(sources.segments.map((s) => countSubscribedInSegment(workspaceId, s)));

  return [
    ...sources.lists.map((l) => ({ kind: "list" as const, id: l.id, name: l.name, subscribed: byList.get(l.id) ?? 0 })),
    ...sources.segments.map((s, i) => ({ kind: "segment" as const, id: s.id, name: s.name, subscribed: segmentCounts[i] })),
  ];
}

/** Subscribed contacts matching one segment. */
async function countSubscribedInSegment(workspaceId: string, segment: SegmentSource): Promise<number> {
  const { match, conditions } = segment.rules;
  // Usually one query: add "status is Subscribed" to an AND-segment. (With 0
  // or 1 conditions, "any" and "all" mean the same thing.)
  if ((match === "all" || conditions.length <= 1) && conditions.length < MAX_CONDITIONS) {
    return countSegment(workspaceId, {
      match: "all",
      conditions: [...conditions, { field: "status", operator: "is", value: ["SUBSCRIBED"] }],
    });
  }
  // An OR-segment can't simply get an extra AND condition: page through its ids.
  let total = 0;
  let cursor: string | null = null;
  do {
    const page = await getSegmentContactIds(workspaceId, segment.checked, { cursor, take: PAGE_SIZE });
    if (page.ids.length) {
      const rows = await db.$queryRaw<{ count: number }[]>`
        SELECT count(*)::int AS count FROM contact c
        WHERE c.id = ANY(${page.ids}::text[]) AND c."workspaceId" = ${workspaceId} AND ${SUBSCRIBED}
      `;
      total += rows[0]?.count ?? 0;
    }
    cursor = page.nextCursor;
  } while (cursor);
  return total;
}

/**
 * SUBSCRIBED contacts matching saved segment rules (for the audience picker).
 * Returns null if the rules no longer work (e.g. a field was deleted).
 */
export async function countSegmentSubscribed(workspaceId: string, rules: unknown): Promise<number | null> {
  const checked = await validateRulesForWorkspace(workspaceId, rules);
  if (!checked.ok) return null;
  return countSubscribedInSegment(workspaceId, { id: "", name: "", rules: checked.rules, checked: checked.checked });
}
