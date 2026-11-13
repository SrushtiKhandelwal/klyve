import "server-only";
import { z } from "zod";
import { AiError } from "@/lib/ai/errors";
import { cleanLine, cleanParagraph } from "@/lib/ai/safety";
import { CONTACT_STATUSES, type AttributeTypeValue } from "@/lib/contacts/common";
import {
  BOOLEAN_OPERATORS,
  DATE_OPERATORS,
  ENGAGEMENT_CAMPAIGN_OPERATORS,
  ENGAGEMENT_DAYS_OPERATORS,
  ENGAGEMENT_FLAG_OPERATORS,
  LIST_OPERATORS,
  MAX_CONDITIONS,
  NUMBER_OPERATORS,
  TEXT_OPERATORS,
  checkSegmentRules,
  type RulesContext,
  type SegmentRules,
} from "@/lib/segments/rules";

// "Describe with AI" on the new-segment page: a sentence like "Pune contacts
// who opened an email in the last 30 days" becomes segment rules.
//
// We tell the AI EXACTLY which fields, operators, custom fields, lists and
// sent campaigns exist in this workspace. Its answer is then checked by the
// very same checker the builder and the server use (checkSegmentRules), so
// a condition that doesn't fit is refused, never saved. The user still
// reviews the conditions and clicks "Create segment" themselves.
//
// PRIVACY: the AI only sees names of fields, lists and campaigns, never any
// contact's details.

export type SegmentAiContext = {
  attributes: { key: string; label: string; type: AttributeTypeValue }[];
  lists: { id: string; name: string }[];
  /** Sent campaigns (newest first). */
  campaigns: { id: string; name: string }[];
  /** "2026-11-14" in the workspace's time zone. */
  today: string;
};

/** Most lists/campaigns we describe to the AI (keeps the prompt small). */
const MAX_CONTEXT_ITEMS = 60;

const without = <T extends string>(ops: readonly T[], drop: string[]) => ops.filter((op) => !drop.includes(op));

const OPERATORS_FOR_TYPE: Record<AttributeTypeValue, readonly string[]> = {
  TEXT: TEXT_OPERATORS,
  NUMBER: NUMBER_OPERATORS,
  DATE: DATE_OPERATORS,
  BOOLEAN: BOOLEAN_OPERATORS,
};

export function segmentPrompt(description: string, ctx: SegmentAiContext) {
  const textOps = TEXT_OPERATORS.join(", ");
  const dateOps = without(DATE_OPERATORS, ["is_empty", "is_not_empty"]).join(", ");
  const attributes = ctx.attributes.length
    ? ctx.attributes.map((a) => `- key "${a.key}" (${a.label}), type ${a.type}: operators ${OPERATORS_FOR_TYPE[a.type].join(", ")}`).join("\n")
    : "(none: this workspace has no custom fields)";
  const lists = ctx.lists.length
    ? ctx.lists.slice(0, MAX_CONTEXT_ITEMS).map((l) => `- id "${l.id}": ${JSON.stringify(l.name)}`).join("\n")
    : "(none)";
  const campaigns = ctx.campaigns.length
    ? ctx.campaigns.slice(0, MAX_CONTEXT_ITEMS).map((c) => `- id "${c.id}": ${JSON.stringify(c.name)}`).join("\n")
    : "(none sent yet)";

  const system = [
    "You turn a description of a group of email contacts into filter rules. You answer with ONE JSON object and nothing else.",
    'JSON shape: {"name": string, "match": "all" | "any", "conditions": [ {"field": string, "key"?: string, "operator": string, "value"?: any} ], "note": string}',
    "",
    "Built-in fields (use exactly these field names):",
    `- "email", "firstName", "lastName": text. Operators: ${textOps} (email has no is_empty/is_not_empty). value: a string.`,
    `- "status": operators is, is_not. value: an array of ${CONTACT_STATUSES.join(", ")}.`,
    `- "createdAt" (date the contact was added): operators ${dateOps}. before/after/on take value "YYYY-MM-DD"; in_last_days/not_in_last_days take a whole number of days.`,
    `- "list": operators ${LIST_OPERATORS.join(", ")}. value: a list id from the lists below.`,
    `- "engagement" (email activity): operators ${ENGAGEMENT_DAYS_OPERATORS.join(", ")} take a whole number of days; ${ENGAGEMENT_CAMPAIGN_OPERATORS.join(", ")} take a campaign id from the campaigns below; ${ENGAGEMENT_FLAG_OPERATORS.join(", ")} take no value.`,
    "",
    'Custom fields: use {"field": "attribute", "key": "<KEY>", ...}. Operators by type:',
    `TEXT: ${TEXT_OPERATORS.join(", ")} (value: string). NUMBER: ${NUMBER_OPERATORS.join(", ")} (value: number). DATE: same as createdAt plus is_empty, is_not_empty. BOOLEAN: ${BOOLEAN_OPERATORS.join(", ")} (no value).`,
    "This workspace's custom fields:",
    attributes,
    "",
    "Lists:",
    lists,
    "",
    "Sent campaigns:",
    campaigns,
    "",
    "Rules:",
    `- Use only the fields, keys, operators, list ids and campaign ids listed above. At most ${MAX_CONDITIONS} conditions.`,
    "- is_empty, is_not_empty, is_true, is_false and the no-value engagement operators have no value.",
    "- For a place like a city, use a matching TEXT custom field (e.g. CITY) with \"equals\" or \"contains\". If no suitable field exists, leave that part out and explain it in note.",
    '- "Subscribers" or "subscribed contacts" means status is ["SUBSCRIBED"].',
    '- "match": "all" when every condition must be true (AND), "any" for OR.',
    "- name: a short name for the segment (max 60 characters), in the user's language.",
    '- note: one short sentence about anything you could not express, or "" if everything fits.',
    `- Today is ${ctx.today}.`,
  ].join("\n");

  return { system, user: description };
}

const looseCondition = z
  .object({
    field: z.string().max(100),
    key: z.string().max(100).nullish(),
    operator: z.string().max(100),
    value: z.unknown().optional(),
  })
  .passthrough();

export const segmentAnswerSchema = z.object({
  name: z.string().max(500).optional().default(""),
  match: z.enum(["all", "any"]).catch("all"),
  conditions: z.array(looseCondition).max(50),
  note: z.string().max(2000).nullish(),
});

const BUILTIN_FIELDS = new Set(["email", "firstName", "lastName", "status", "createdAt", "list", "engagement"]);

/**
 * Tidies the AI's conditions into the exact shape the rules checker expects:
 * a custom field written as {"field": "CITY"} becomes {"field": "attribute",
 * "key": "CITY"}, a list or campaign given by NAME becomes its id, and extra
 * properties are dropped. Anything still wrong is caught by checkSegmentRules.
 */
export function normalizeConditions(
  conditions: z.output<typeof looseCondition>[],
  ctx: SegmentAiContext,
): unknown[] {
  const attributeKeys = new Map(ctx.attributes.map((a) => [a.key.toUpperCase(), a.key]));
  const byName = (items: { id: string; name: string }[], value: unknown) => {
    if (typeof value !== "string") return value;
    if (items.some((i) => i.id === value)) return value;
    const match = items.find((i) => i.name.trim().toLowerCase() === value.trim().toLowerCase());
    return match ? match.id : value;
  };

  return conditions.map((c) => {
    let field = c.field;
    let key = c.key ?? undefined;
    if (!BUILTIN_FIELDS.has(field) && field !== "attribute") {
      const known = attributeKeys.get(field.toUpperCase());
      if (known) {
        key = known;
        field = "attribute";
      }
    }
    if (field === "attribute" && typeof key === "string") key = attributeKeys.get(key.toUpperCase()) ?? key;

    let value = c.value;
    if (field === "list") value = byName(ctx.lists, value);
    if (field === "engagement" && (ENGAGEMENT_CAMPAIGN_OPERATORS as readonly string[]).includes(c.operator)) {
      value = byName(ctx.campaigns, value);
    }
    if (field === "status" && typeof value === "string") value = [value];
    if (Array.isArray(value) && field === "status") value = value.map((v) => (typeof v === "string" ? v.toUpperCase() : v));

    const out: Record<string, unknown> = { field, operator: c.operator };
    if (field === "attribute") out.key = key ?? "";
    if (value !== undefined && value !== null) out.value = value;
    return out;
  });
}

export type SegmentSuggestion = { name: string; rules: SegmentRules; note: string };

/** Checks the AI's rules against the workspace. Throws AiError("bad_output", …) when they don't fit. */
export function acceptSegment(
  answer: z.output<typeof segmentAnswerSchema>,
  ctx: SegmentAiContext,
  rulesContext: RulesContext,
): SegmentSuggestion {
  const note = cleanParagraph(answer.note ?? "", 300);
  if (answer.conditions.length === 0) {
    throw new AiError(
      "bad_output",
      note ? `The AI couldn't turn that into conditions: ${note}` : "The AI couldn't turn that into conditions. Try describing it differently.",
    );
  }
  const checked = checkSegmentRules(
    { match: answer.match, conditions: normalizeConditions(answer.conditions.slice(0, MAX_CONDITIONS), ctx) },
    rulesContext,
  );
  if (!checked.ok) {
    throw new AiError(
      "bad_output",
      `The AI suggested a condition we can't use (${checked.errors[0] ?? "unknown problem"}). Try describing it differently.`,
    );
  }
  return { name: cleanLine(answer.name, 100), rules: checked.rules, note };
}
