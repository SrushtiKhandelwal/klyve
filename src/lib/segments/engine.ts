import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { ContactStatusValue } from "@/lib/contacts/common";
import {
  ATTRIBUTE_KEY_PATTERN,
  checkSegmentRules,
  type ResolvedCondition,
  type RulesContext,
  type SegmentRules,
} from "@/lib/segments/rules";

// The segment engine: turns segment rules into ONE SQL query and runs it.
//
// WHY RAW SQL (and not Prisma's `where` filters)?
// Custom fields live in a JSON column. Prisma's JSON filters can't do
// case-insensitive "contains", can't compare JSON numbers as numbers safely,
// and can't compare dates stored as text. Postgres can do all of that.
//
// HOW WE STAY SAFE FROM SQL INJECTION:
// - Every value (including JSON keys and list ids) goes through the
//   Prisma.sql`...` template, which sends it as a separate bound parameter
//   ($1, $2, ...). Values are never pasted into the SQL text.
// - Rules are validated (checkSegmentRules + database lookups) before any SQL
//   is built, and keys are re-checked against ^[A-Z][A-Z0-9_]{0,39}$.
// - Every query starts with c."workspaceId" = <the caller's workspace>, so
//   another workspace's contacts can never match.
//
// SEMANTICS FOR EMPTY VALUES (keep the UI help text in sync with this):
// - "Empty" means: no value at all (key missing), JSON null, or blank text.
// - Positive operators (is, contains, >, before, ...) never match empty values.
// - Negated operators (is not, does not contain, does not equal,
//   is not in the last N days) DO match empty values: a contact without a
//   city "does not contain pune".
// - "is no" (BOOLEAN) only matches an explicit false. Use "is empty" for unknown.
// - A NUMBER field only counts JSON numbers (or text that looks like a number).
//   A DATE field only counts "YYYY-MM-DD" text. Anything else counts as empty.
// - Dates are compared as calendar days in UTC.

/** Rules that passed validation for one workspace. Only this file can create them. */
class CheckedSegmentRules {
  constructor(
    readonly workspaceId: string,
    readonly rules: SegmentRules,
    readonly conditions: ResolvedCondition[],
  ) {}
}
export type { CheckedSegmentRules };

export type ValidateRulesResult =
  | { ok: true; rules: SegmentRules; checked: CheckedSegmentRules }
  | { ok: false; errors: string[] };

/** Thrown by count/preview/ids when given rules that don't pass validation. */
export class InvalidSegmentRulesError extends Error {
  constructor(readonly errors: string[]) {
    super(`Invalid segment rules: ${errors.join("; ")}`);
    this.name = "InvalidSegmentRulesError";
  }
}

/** A workspace's field types and list ids, loaded once to check many segments. */
export type WorkspaceRulesContext = RulesContext & { workspaceId: string };

export async function loadRulesContext(workspaceId: string): Promise<WorkspaceRulesContext> {
  const [attributes, lists] = await Promise.all([
    db.contactAttribute.findMany({ where: { workspaceId }, select: { key: true, type: true } }),
    db.contactList.findMany({ where: { workspaceId }, select: { id: true } }),
  ]);
  return {
    workspaceId,
    attributeTypes: new Map(attributes.map((a) => [a.key, a.type])),
    listIds: new Set(lists.map((l) => l.id)),
  };
}

/**
 * Checks rules against THIS workspace: custom field keys must exist and the
 * operator must fit their type, list ids must belong to the workspace, values
 * must have the right type. Returns a cleaned copy that is safe to save.
 * Pass `context` from loadRulesContext() when checking many rules at once.
 */
export async function validateRulesForWorkspace(
  workspaceId: string,
  input: unknown,
  context?: WorkspaceRulesContext,
): Promise<ValidateRulesResult> {
  // A context loaded for another workspace is ignored, never trusted.
  const ctx = context?.workspaceId === workspaceId ? context : await loadRulesContext(workspaceId);

  const result = checkSegmentRules(input, ctx);
  if (!result.ok) return result;

  return {
    ok: true,
    rules: result.rules,
    checked: new CheckedSegmentRules(workspaceId, result.rules, result.conditions),
  };
}

/** Raw rules, or the `checked` object from validateRulesForWorkspace (skips re-checking). */
export type SegmentRulesInput = unknown;

async function resolve(workspaceId: string, input: SegmentRulesInput): Promise<CheckedSegmentRules> {
  // Reuse an already-checked object, but only for the SAME workspace (list ids
  // and field types are per workspace).
  if (input instanceof CheckedSegmentRules && input.workspaceId === workspaceId) return input;
  const raw = input instanceof CheckedSegmentRules ? input.rules : input;
  const result = await validateRulesForWorkspace(workspaceId, raw);
  if (!result.ok) throw new InvalidSegmentRulesError(result.errors);
  return result.checked;
}

/** How many contacts in the workspace match the rules. */
export async function countSegment(workspaceId: string, rules: SegmentRulesInput): Promise<number> {
  const checked = await resolve(workspaceId, rules);
  const rows = await db.$queryRaw<{ count: number }[]>`
    SELECT count(*)::int AS count
    FROM contact c
    WHERE ${whereClause(checked)}
  `;
  return rows[0]?.count ?? 0;
}

export type SegmentPreviewContact = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: ContactStatusValue;
  createdAt: Date;
};

/** The first `limit` matching contacts, newest first. */
export async function previewSegment(
  workspaceId: string,
  rules: SegmentRulesInput,
  { limit = 10 }: { limit?: number } = {},
): Promise<SegmentPreviewContact[]> {
  const checked = await resolve(workspaceId, rules);
  const take = clampInt(limit, 1, 100);
  return db.$queryRaw<SegmentPreviewContact[]>`
    SELECT c.id, c.email, c."firstName", c."lastName", c.status::text AS status, c."createdAt"
    FROM contact c
    WHERE ${whereClause(checked)}
    ORDER BY c."createdAt" DESC, c.id DESC
    LIMIT ${take}
  `;
}

/**
 * Matching contact ids in pages, for sending campaigns to big segments.
 * Pass the returned `nextCursor` back in to get the next page; it is null
 * once there are no more. Ids are sorted, so contacts added while you page
 * are either included once or not at all, never twice.
 */
export async function getSegmentContactIds(
  workspaceId: string,
  rules: SegmentRulesInput,
  { cursor, take }: { cursor?: string | null; take: number },
): Promise<{ ids: string[]; nextCursor: string | null }> {
  const checked = await resolve(workspaceId, rules);
  const size = clampInt(take, 1, 10_000);
  // COLLATE "C" = plain byte order, so "> cursor" and ORDER BY always agree.
  const after = cursor ? Prisma.sql`AND c.id COLLATE "C" > ${cursor}` : Prisma.empty;
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT c.id
    FROM contact c
    WHERE ${whereClause(checked)} ${after}
    ORDER BY c.id COLLATE "C" ASC
    LIMIT ${size}
  `;
  const ids = rows.map((r) => r.id);
  return { ids, nextCursor: ids.length === size ? ids[ids.length - 1] : null };
}

// ─────────────────────────────────────────────
// SQL building. Everything below only ever sees CHECKED rules.
// ─────────────────────────────────────────────

function whereClause(checked: CheckedSegmentRules): Prisma.Sql {
  const workspace = Prisma.sql`c."workspaceId" = ${checked.workspaceId}`;
  if (checked.conditions.length === 0) return workspace; // no conditions = everyone

  const parts = checked.conditions.map((c) => Prisma.sql`(${conditionSql(c)})`);
  const joined = Prisma.join(parts, checked.rules.match === "all" ? " AND " : " OR ");
  return Prisma.sql`${workspace} AND (${joined})`;
}

function conditionSql(c: ResolvedCondition): Prisma.Sql {
  switch (c.kind) {
    case "TEXT":
      return textSql(c);
    case "NUMBER":
      return numberSql(c);
    case "DATE":
      return c.field === "createdAt" ? createdAtSql(c) : dateAttributeSql(c);
    case "BOOLEAN":
      return booleanSql(c);
    case "STATUS":
      return statusSql(c);
    case "LIST":
      return listSql(c);
  }
}

/** Double-check before a key goes anywhere near SQL (it's still sent as a parameter). */
function safeKey(c: ResolvedCondition): string {
  if (c.field !== "attribute" || !ATTRIBUTE_KEY_PATTERN.test(c.key)) {
    throw new Error("Unsafe attribute key");
  }
  return c.key;
}

function stringValue(c: ResolvedCondition): string {
  if (typeof c.value !== "string") throw new Error(`Condition value must be text (${c.operator})`);
  return c.value;
}

function numberValue(c: ResolvedCondition): number {
  if (typeof c.value !== "number" || !Number.isFinite(c.value)) {
    throw new Error(`Condition value must be a number (${c.operator})`);
  }
  return c.value;
}

// ── Text: email, first/last name, TEXT custom fields ──────────────────────

function textExpression(c: ResolvedCondition): Prisma.Sql {
  switch (c.field) {
    case "email":
      return Prisma.sql`c.email`;
    case "firstName":
      return Prisma.sql`c."firstName"`;
    case "lastName":
      return Prisma.sql`c."lastName"`;
    case "attribute":
      // ->> gives the value as text (SQL NULL for a missing key or JSON null).
      return Prisma.sql`(c.attributes ->> ${safeKey(c)}::text)`;
    default:
      throw new Error(`Not a text field: ${c.field}`);
  }
}

function textSql(c: ResolvedCondition): Prisma.Sql {
  const v = textExpression(c);
  const isEmpty = Prisma.sql`(${v} IS NULL OR btrim(${v}) = '')`;

  if (c.operator === "is_empty") return isEmpty;
  if (c.operator === "is_not_empty") return Prisma.sql`NOT ${isEmpty}`;

  // Lower-case both sides for case-insensitive matching. strpos() and
  // starts_with() treat the value as plain text, so % and _ have no special
  // meaning (unlike LIKE) and need no escaping.
  const value = Prisma.sql`lower(${stringValue(c)}::text)`;
  const lowered = Prisma.sql`lower(${v})`;
  switch (c.operator) {
    case "equals":
      return Prisma.sql`${lowered} = ${value}`;
    case "not_equals":
      return Prisma.sql`(${v} IS NULL OR ${lowered} <> ${value})`;
    case "contains":
      return Prisma.sql`strpos(${lowered}, ${value}) > 0`;
    case "not_contains":
      return Prisma.sql`(${v} IS NULL OR strpos(${lowered}, ${value}) = 0)`;
    case "starts_with":
      return Prisma.sql`starts_with(${lowered}, ${value})`;
    case "ends_with":
      return Prisma.sql`right(${lowered}, char_length(${value})) = ${value}`;
    default:
      throw new Error(`Unsupported text operator: ${c.operator}`);
  }
}

// ── Number custom fields ──────────────────────────────────────────────────

function numberSql(c: ResolvedCondition): Prisma.Sql {
  const key = safeKey(c);
  // A JSON number, or text that looks like a number ("31"); anything else is
  // NULL. Checking first means a value like "abc" can never cause a cast error.
  const n = Prisma.sql`(CASE
      WHEN jsonb_typeof(c.attributes -> ${key}::text) = 'number'
        THEN (c.attributes ->> ${key}::text)::numeric
      WHEN jsonb_typeof(c.attributes -> ${key}::text) = 'string'
        AND (c.attributes ->> ${key}::text) ~ '^ *-?[0-9]+([.][0-9]+)? *$'
        THEN btrim(c.attributes ->> ${key}::text)::numeric
    END)`;

  if (c.operator === "is_empty") return Prisma.sql`${n} IS NULL`;
  if (c.operator === "is_not_empty") return Prisma.sql`${n} IS NOT NULL`;

  const value = Prisma.sql`${numberValue(c)}::numeric`;
  switch (c.operator) {
    case "eq":
      return Prisma.sql`${n} = ${value}`;
    case "neq":
      return Prisma.sql`(${n} IS NULL OR ${n} <> ${value})`;
    case "gt":
      return Prisma.sql`${n} > ${value}`;
    case "gte":
      return Prisma.sql`${n} >= ${value}`;
    case "lt":
      return Prisma.sql`${n} < ${value}`;
    case "lte":
      return Prisma.sql`${n} <= ${value}`;
    default:
      throw new Error(`Unsupported number operator: ${c.operator}`);
  }
}

// ── Dates ─────────────────────────────────────────────────────────────────

/** Today's date (UTC) as a Postgres date. */
const TODAY_UTC = Prisma.sql`(now() AT TIME ZONE 'UTC')::date`;

/** DATE custom fields are stored as "YYYY-MM-DD" text. */
function dateAttributeSql(c: ResolvedCondition): Prisma.Sql {
  const key = safeKey(c);
  // Only well-formed "YYYY-MM-DD" text counts. We compare these as text
  // (that sorts correctly for this format) instead of casting to a date,
  // because casting a bad value like "2025-02-30" would make the query fail.
  // COLLATE "C" makes the comparison plain character order.
  const d = Prisma.sql`(CASE
      WHEN (c.attributes ->> ${key}::text) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        THEN (c.attributes ->> ${key}::text)
    END) COLLATE "C"`;

  const dayText = (date: Prisma.Sql) => Prisma.sql`to_char(${date}, 'YYYY-MM-DD')`;

  switch (c.operator) {
    case "is_empty":
      return Prisma.sql`${d} IS NULL`;
    case "is_not_empty":
      return Prisma.sql`${d} IS NOT NULL`;
    case "before":
      return Prisma.sql`${d} < ${stringValue(c)}::text`;
    case "after":
      return Prisma.sql`${d} > ${stringValue(c)}::text`;
    case "on":
      return Prisma.sql`${d} = ${stringValue(c)}::text`;
    case "in_last_days":
    case "not_in_last_days": {
      // Between N days ago and today, both included.
      const from = dayText(Prisma.sql`${TODAY_UTC} - ${numberValue(c)}::int`);
      const inRange = Prisma.sql`(${d} >= ${from} AND ${d} <= ${dayText(TODAY_UTC)})`;
      return c.operator === "in_last_days"
        ? inRange
        : Prisma.sql`(${d} IS NULL OR NOT ${inRange})`;
    }
    default:
      throw new Error(`Unsupported date operator: ${c.operator}`);
  }
}

/** contact."createdAt" is a timestamp stored in UTC (never empty). */
function createdAtSql(c: ResolvedCondition): Prisma.Sql {
  const col = Prisma.sql`c."createdAt"`;
  switch (c.operator) {
    case "before":
      return Prisma.sql`${col} < ${stringValue(c)}::date`;
    case "after":
      return Prisma.sql`${col} >= ${stringValue(c)}::date + 1`;
    case "on":
      return Prisma.sql`(${col} >= ${stringValue(c)}::date AND ${col} < ${stringValue(c)}::date + 1)`;
    case "in_last_days":
      return Prisma.sql`${col} >= (now() AT TIME ZONE 'UTC') - make_interval(days => ${numberValue(c)}::int)`;
    case "not_in_last_days":
      return Prisma.sql`${col} < (now() AT TIME ZONE 'UTC') - make_interval(days => ${numberValue(c)}::int)`;
    default:
      throw new Error(`Unsupported date operator: ${c.operator}`);
  }
}

// ── Yes / No custom fields ────────────────────────────────────────────────

function booleanSql(c: ResolvedCondition): Prisma.Sql {
  const value = Prisma.sql`(c.attributes -> ${safeKey(c)}::text)`;
  switch (c.operator) {
    case "is_true":
      return Prisma.sql`${value} = 'true'::jsonb`;
    case "is_false":
      return Prisma.sql`${value} = 'false'::jsonb`;
    case "is_empty":
      // Missing, JSON null, or anything that isn't true/false.
      return Prisma.sql`jsonb_typeof(${value}) IS DISTINCT FROM 'boolean'`;
    default:
      throw new Error(`Unsupported yes/no operator: ${c.operator}`);
  }
}

// ── Status and lists ──────────────────────────────────────────────────────

function statusSql(c: ResolvedCondition): Prisma.Sql {
  if (!Array.isArray(c.value) || c.value.length === 0) throw new Error("Status list is empty");
  const statuses = Prisma.join(c.value.map((s) => Prisma.sql`${s}::text`));
  return c.operator === "is"
    ? Prisma.sql`c.status::text IN (${statuses})`
    : Prisma.sql`c.status::text NOT IN (${statuses})`;
}

function listSql(c: ResolvedCondition): Prisma.Sql {
  const member = Prisma.sql`EXISTS (
    SELECT 1 FROM list_membership lm
    WHERE lm."contactId" = c.id AND lm."listId" = ${stringValue(c)}
  )`;
  return c.operator === "in_list" ? member : Prisma.sql`NOT ${member}`;
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.floor(n)));
}
