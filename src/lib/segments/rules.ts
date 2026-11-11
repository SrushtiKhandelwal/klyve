// Segment rules: the shape of a saved filter, the operators each kind of field
// supports, and a pure checker that cleans up rules before we use them.
//
// Safe to import from BOTH server and client code (no database access here).
// The browser uses it to show the right inputs and catch mistakes early; the
// server (src/lib/segments/engine.ts) runs the very same checks again, because
// anything sent from the browser can be tampered with.
import { z } from "zod";
import {
  CONTACT_STATUSES,
  CONTACT_STATUS_META,
  parseAttributeValue,
  type AttributeTypeValue,
  type ContactStatusValue,
} from "@/lib/contacts/common";

/** Most conditions one segment may have (keeps the SQL small and fast). */
export const MAX_CONDITIONS = 25;

/** Same rule as attributeKeySchema: CITY, AGE, FAVOURITE_COLOUR, ... */
export const ATTRIBUTE_KEY_PATTERN = /^[A-Z][A-Z0-9_]{0,39}$/;

// ─────────────────────────────────────────────
// Fields and operators
// ─────────────────────────────────────────────

/** Built-in things you can filter on. Custom fields use field: "attribute". */
export const BUILTIN_SEGMENT_FIELDS = [
  "email",
  "firstName",
  "lastName",
  "status",
  "createdAt",
  "list",
] as const;
export type BuiltinSegmentField = (typeof BUILTIN_SEGMENT_FIELDS)[number];
export type SegmentField = BuiltinSegmentField | "attribute";

export const BUILTIN_FIELD_LABELS: Record<BuiltinSegmentField, string> = {
  email: "Email",
  firstName: "First name",
  lastName: "Last name",
  status: "Status",
  createdAt: "Date added",
  list: "List",
};

/** Decides which operators and which value input a field gets. */
export type FieldKind = AttributeTypeValue | "STATUS" | "LIST";

const BUILTIN_FIELD_KINDS: Record<BuiltinSegmentField, FieldKind> = {
  email: "TEXT",
  firstName: "TEXT",
  lastName: "TEXT",
  status: "STATUS",
  createdAt: "DATE",
  list: "LIST",
};

export const TEXT_OPERATORS = [
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "is_empty",
  "is_not_empty",
] as const;
export const NUMBER_OPERATORS = ["eq", "neq", "gt", "gte", "lt", "lte", "is_empty", "is_not_empty"] as const;
export const DATE_OPERATORS = [
  "before",
  "after",
  "on",
  "in_last_days",
  "not_in_last_days",
  "is_empty",
  "is_not_empty",
] as const;
export const BOOLEAN_OPERATORS = ["is_true", "is_false", "is_empty"] as const;
export const STATUS_OPERATORS = ["is", "is_not"] as const;
export const LIST_OPERATORS = ["in_list", "not_in_list"] as const;

/** Every operator name, once each. */
export const ALL_OPERATORS = [
  ...TEXT_OPERATORS,
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "before",
  "after",
  "on",
  "in_last_days",
  "not_in_last_days",
  ...BOOLEAN_OPERATORS.filter((op) => op !== "is_empty"),
  ...STATUS_OPERATORS,
  ...LIST_OPERATORS,
] as const;
export type SegmentOperator = (typeof ALL_OPERATORS)[number];

const OPERATORS_BY_KIND: Record<FieldKind, readonly SegmentOperator[]> = {
  TEXT: TEXT_OPERATORS,
  NUMBER: NUMBER_OPERATORS,
  DATE: DATE_OPERATORS,
  BOOLEAN: BOOLEAN_OPERATORS,
  STATUS: STATUS_OPERATORS,
  LIST: LIST_OPERATORS,
};

/** Words shown in the operator dropdown and in summaries. */
export const OPERATOR_LABELS: Record<SegmentOperator, string> = {
  equals: "is",
  not_equals: "is not",
  contains: "contains",
  not_contains: "does not contain",
  starts_with: "starts with",
  ends_with: "ends with",
  is_empty: "is empty",
  is_not_empty: "is not empty",
  eq: "equals",
  neq: "does not equal",
  gt: "is greater than",
  gte: "is at least",
  lt: "is less than",
  lte: "is at most",
  before: "is before",
  after: "is after",
  on: "is on",
  in_last_days: "is in the last",
  not_in_last_days: "is not in the last",
  is_true: "is yes",
  is_false: "is no",
  is: "is",
  is_not: "is not",
  in_list: "is in list",
  not_in_list: "is not in list",
};

/** Operators that don't need a value (the value box is hidden for them). */
export const VALUELESS_OPERATORS = new Set<SegmentOperator>([
  "is_empty",
  "is_not_empty",
  "is_true",
  "is_false",
]);

/** The operators allowed for a field. Email and date added are never empty. */
export function operatorsForField(field: SegmentField, kind: FieldKind): readonly SegmentOperator[] {
  const ops = OPERATORS_BY_KIND[kind];
  if (field === "email" || field === "createdAt") {
    return ops.filter((op) => op !== "is_empty" && op !== "is_not_empty");
  }
  return ops;
}

/** The kind of a built-in field (custom fields get theirs from the database). */
export function builtinFieldKind(field: BuiltinSegmentField): FieldKind {
  return BUILTIN_FIELD_KINDS[field];
}

// ─────────────────────────────────────────────
// The rules shape (what is stored in Segment.rules)
// ─────────────────────────────────────────────

// The value's exact type depends on the field and operator, so the schema
// only checks the outer shape here. checkSegmentRules() below does the
// per-type checks once it knows each field's type.
const conditionValueSchema = z
  .union([
    z.string().max(1000),
    z.number(),
    z.boolean(),
    z.array(z.string().max(64)).max(CONTACT_STATUSES.length),
  ])
  .nullable()
  .optional();

const builtinConditionSchema = z.strictObject({
  field: z.enum(BUILTIN_SEGMENT_FIELDS),
  operator: z.enum(ALL_OPERATORS),
  value: conditionValueSchema,
});

const attributeConditionSchema = z.strictObject({
  field: z.literal("attribute"),
  key: z.string().regex(ATTRIBUTE_KEY_PATTERN, "Invalid field key."),
  operator: z.enum(ALL_OPERATORS),
  value: conditionValueSchema,
});

export const segmentConditionSchema = z.union([builtinConditionSchema, attributeConditionSchema]);

/** Strict schema for the rules object. Unknown properties are rejected. */
export const segmentRulesSchema = z.strictObject({
  match: z.enum(["all", "any"]),
  conditions: z
    .array(segmentConditionSchema)
    .max(MAX_CONDITIONS, `A segment can have at most ${MAX_CONDITIONS} conditions.`),
});

/**
 * One condition, e.g. { field: "attribute", key: "CITY", operator: "contains", value: "pune" }.
 * value is:
 *  - text operators:        a string
 *  - number operators:      a number
 *  - before / after / on:   a "YYYY-MM-DD" string
 *  - in_last_days (+ not):  a whole number of days
 *  - status is / is_not:    an array of statuses, e.g. ["SUBSCRIBED"]
 *  - list operators:        a list id
 *  - is_empty and friends:  null (not needed)
 */
export type SegmentCondition = z.infer<typeof segmentConditionSchema>;

/** match "all" = every condition must be true (AND); "any" = at least one (OR). */
export type SegmentRules = z.infer<typeof segmentRulesSchema>;

/** No conditions = everyone in the workspace. */
export const EMPTY_RULES: SegmentRules = { match: "all", conditions: [] };

/** A condition after checking: its field kind is known and its value is clean. */
export type ResolvedCondition = SegmentCondition & {
  kind: FieldKind;
  value: string | number | string[] | null;
};

/** What we need to know about the workspace to check rules. */
export type RulesContext = {
  /** Custom field key → its type. */
  attributeTypes: ReadonlyMap<string, AttributeTypeValue>;
  /** Ids of the workspace's lists. Leave out to skip the list check (browser). */
  listIds?: ReadonlySet<string>;
};

export type CheckRulesResult =
  | { ok: true; rules: SegmentRules; conditions: ResolvedCondition[] }
  | { ok: false; errors: string[] };

/**
 * Checks rules from an untrusted source and returns a cleaned-up copy.
 * Each error message says which condition is wrong ("Condition 2: ...").
 */
export function checkSegmentRules(input: unknown, context: RulesContext): CheckRulesResult {
  const parsed = segmentRulesSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((issue) => issue.message) };
  }

  const errors: string[] = [];
  const conditions: ResolvedCondition[] = [];

  parsed.data.conditions.forEach((condition, index) => {
    const result = checkCondition(condition, context);
    if (result.ok) conditions.push(result.condition);
    else errors.push(`Condition ${index + 1}: ${result.error}`);
  });

  if (errors.length > 0) return { ok: false, errors };

  const rules: SegmentRules = { match: parsed.data.match, conditions: conditions.map(toStoredCondition) };
  return { ok: true, rules, conditions };
}

/** The clean copy we save: no `kind`, and no value for "is empty"-style operators. */
function toStoredCondition(c: ResolvedCondition): SegmentCondition {
  const base =
    c.field === "attribute"
      ? { field: c.field, key: c.key, operator: c.operator }
      : { field: c.field, operator: c.operator };
  return c.value === null ? base : { ...base, value: c.value };
}

type CheckConditionResult = { ok: true; condition: ResolvedCondition } | { ok: false; error: string };

/** Checks one condition: the field exists, the operator fits it, the value fits both. */
export function checkCondition(condition: SegmentCondition, context: RulesContext): CheckConditionResult {
  let kind: FieldKind;
  if (condition.field === "attribute") {
    const type = context.attributeTypes.get(condition.key);
    if (!type) return { ok: false, error: `The field ${condition.key} no longer exists.` };
    kind = type;
  } else {
    kind = BUILTIN_FIELD_KINDS[condition.field];
  }

  const { operator } = condition;
  if (!operatorsForField(condition.field, kind).includes(operator)) {
    return { ok: false, error: `"${OPERATOR_LABELS[operator]}" can't be used with this field.` };
  }

  const value = checkValue(kind, operator, condition.value, context);
  if (!value.ok) return value;
  return { ok: true, condition: { ...condition, kind, value: value.value } };
}

function checkValue(
  kind: FieldKind,
  operator: SegmentOperator,
  raw: unknown,
  context: RulesContext,
): { ok: true; value: string | number | string[] | null } | { ok: false; error: string } {
  if (VALUELESS_OPERATORS.has(operator)) return { ok: true, value: null };

  switch (kind) {
    case "TEXT": {
      if (typeof raw !== "string" && typeof raw !== "number") return { ok: false, error: "Enter a value." };
      const text = String(raw).trim();
      if (text === "") return { ok: false, error: "Enter a value." };
      if (text.length > 1000) return { ok: false, error: "The value is too long." };
      return { ok: true, value: text };
    }

    case "NUMBER": {
      const n = toNumber(raw);
      if (n === null) return { ok: false, error: "Enter a number." };
      return { ok: true, value: n };
    }

    case "DATE": {
      if (operator === "in_last_days" || operator === "not_in_last_days") {
        const days = toNumber(raw);
        if (days === null || !Number.isInteger(days) || days < 1 || days > 36500) {
          return { ok: false, error: "Enter a whole number of days (1 or more)." };
        }
        return { ok: true, value: days };
      }
      if (typeof raw !== "string" || raw.trim() === "") return { ok: false, error: "Pick a date." };
      const parsed = parseAttributeValue("DATE", raw);
      if (!parsed.ok || typeof parsed.value !== "string") return { ok: false, error: "Pick a valid date." };
      return { ok: true, value: parsed.value };
    }

    case "STATUS": {
      if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error: "Pick at least one status." };
      const statuses = new Set<string>();
      for (const s of raw) {
        if (!(CONTACT_STATUSES as readonly string[]).includes(s)) {
          return { ok: false, error: "Unknown status." };
        }
        statuses.add(s);
      }
      // Always in the same order, so saved rules look tidy.
      return { ok: true, value: CONTACT_STATUSES.filter((s) => statuses.has(s)) };
    }

    case "LIST": {
      if (typeof raw !== "string" || raw.trim() === "" || raw.length > 64) {
        return { ok: false, error: "Pick a list." };
      }
      if (context.listIds && !context.listIds.has(raw)) {
        return { ok: false, error: "That list no longer exists." };
      }
      return { ok: true, value: raw };
    }

    case "BOOLEAN":
      // Every boolean operator is valueless, so we never get here.
      return { ok: true, value: null };
  }
}

/** 42, "42", "1,234.5" → number; anything else → null. Huge numbers are refused. */
function toNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) && Math.abs(raw) < 1e15 ? raw : null;
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const parsed = parseAttributeValue("NUMBER", raw);
  if (!parsed.ok || typeof parsed.value !== "number" || Math.abs(parsed.value) >= 1e15) return null;
  return parsed.value;
}

// ─────────────────────────────────────────────
// Human-readable summary
// ─────────────────────────────────────────────

export type SummaryLookups = {
  /** Custom field key → label, e.g. CITY → "City". */
  attributeLabels?: ReadonlyMap<string, string>;
  /** List id → list name. */
  listNames?: ReadonlyMap<string, string>;
};

/**
 * One line describing the rules, e.g.
 *   Status is Subscribed AND City contains "pune"
 * Empty rules → "Everyone in this workspace".
 */
export function describeSegmentRules(rules: SegmentRules, lookups: SummaryLookups = {}): string {
  if (rules.conditions.length === 0) return "Everyone in this workspace";
  const joiner = rules.match === "all" ? " AND " : " OR ";
  return rules.conditions.map((c) => describeCondition(c, lookups)).join(joiner);
}

export function describeCondition(condition: SegmentCondition, lookups: SummaryLookups = {}): string {
  const fieldName =
    condition.field === "attribute"
      ? (lookups.attributeLabels?.get(condition.key) ?? condition.key)
      : BUILTIN_FIELD_LABELS[condition.field];
  const op = OPERATOR_LABELS[condition.operator];
  const v = condition.value;

  if (VALUELESS_OPERATORS.has(condition.operator)) return `${fieldName} ${op}`;

  switch (condition.operator) {
    case "is":
    case "is_not": {
      const names = Array.isArray(v)
        ? v.map((s) => CONTACT_STATUS_META[s as ContactStatusValue]?.label ?? s)
        : [];
      return `${fieldName} ${op} ${names.join(" or ")}`;
    }
    case "in_list":
    case "not_in_list": {
      const name = typeof v === "string" ? (lookups.listNames?.get(v) ?? "a deleted list") : "?";
      return `${fieldName.toLowerCase() === "list" ? "Contact" : fieldName} ${op} "${name}"`;
    }
    case "in_last_days":
    case "not_in_last_days":
      return `${fieldName} ${op} ${v} ${v === 1 ? "day" : "days"}`;
    default:
      return typeof v === "string" ? `${fieldName} ${op} "${v}"` : `${fieldName} ${op} ${v}`;
  }
}
