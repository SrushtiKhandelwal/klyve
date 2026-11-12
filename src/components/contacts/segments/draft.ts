// Helpers for the rule builder: convert between the rows the user edits
// ("drafts", where every input is kept as text) and the saved rule format.
import type { AttributeTypeValue } from "@/lib/contacts/common";
import {
  BUILTIN_FIELD_LABELS,
  VALUELESS_OPERATORS,
  builtinFieldKind,
  isEngagementCampaignOperator,
  isEngagementDaysOperator,
  operatorsForField,
  type BuiltinSegmentField,
  type FieldKind,
  type SegmentCondition,
  type SegmentField,
  type SegmentOperator,
} from "@/lib/segments/rules";

export type AttributeOption = { key: string; label: string; type: AttributeTypeValue };
export type ListOption = { id: string; name: string };
/** A sent campaign for the "Email activity" picker. sentAt is ISO text. */
export type CampaignOption = { id: string; name: string; sentAt: string | null };

/** One entry in the "field" dropdown. id is "email", "status", ... or "attr:CITY". */
export type FieldOption = {
  id: string;
  label: string;
  kind: FieldKind;
  group: "Contact" | "Lists" | "Email activity" | "Custom fields";
  /** A custom field that was deleted but is still used by this segment. */
  missing?: boolean;
};

/** One condition row while it's being edited. */
export type DraftCondition = {
  uid: string;
  fieldId: string;
  operator: SegmentOperator;
  /** Text, number, date ("YYYY-MM-DD") or number of days, as typed. */
  text: string;
  statuses: string[];
  listId: string;
  campaignId: string;
};

const CONTACT_FIELDS: BuiltinSegmentField[] = ["email", "firstName", "lastName", "status", "createdAt"];

export function buildFieldOptions(attributes: AttributeOption[], usedFieldIds: string[]): FieldOption[] {
  const options: FieldOption[] = [
    ...CONTACT_FIELDS.map((f) => ({
      id: f,
      label: BUILTIN_FIELD_LABELS[f],
      kind: builtinFieldKind(f),
      group: "Contact" as const,
    })),
    { id: "list", label: "List membership", kind: "LIST", group: "Lists" },
    { id: "engagement", label: BUILTIN_FIELD_LABELS.engagement, kind: "ENGAGEMENT", group: "Email activity" },
    ...attributes.map((a) => ({
      id: `attr:${a.key}`,
      label: a.label,
      kind: a.type,
      group: "Custom fields" as const,
    })),
  ];
  // Keep deleted fields selectable so the row can show what it used to be.
  for (const id of usedFieldIds) {
    if (id.startsWith("attr:") && !options.some((o) => o.id === id)) {
      options.push({ id, label: `${id.slice(5)} (deleted)`, kind: "TEXT", group: "Custom fields", missing: true });
    }
  }
  return options;
}

export function fieldOf(fieldId: string): { field: SegmentField; key?: string } {
  return fieldId.startsWith("attr:")
    ? { field: "attribute", key: fieldId.slice(5) }
    : { field: fieldId as BuiltinSegmentField };
}

export function operatorsFor(option: FieldOption): readonly SegmentOperator[] {
  return operatorsForField(fieldOf(option.id).field, option.kind);
}

/** What kind of value box an operator needs. */
export type ValueInputKind = "none" | "text" | "number" | "date" | "days" | "statuses" | "list" | "campaign";

export function valueInputKind(kind: FieldKind, operator: SegmentOperator): ValueInputKind {
  if (VALUELESS_OPERATORS.has(operator)) return "none";
  switch (kind) {
    case "TEXT":
      return "text";
    case "NUMBER":
      return "number";
    case "DATE":
      return operator === "in_last_days" || operator === "not_in_last_days" ? "days" : "date";
    case "STATUS":
      return "statuses";
    case "LIST":
      return "list";
    case "BOOLEAN":
      return "none";
    case "ENGAGEMENT":
      if (isEngagementDaysOperator(operator)) return "days";
      if (isEngagementCampaignOperator(operator)) return "campaign";
      return "none";
  }
}

/** What the days box starts with for email activity ("opened in the last 30 days"). */
export const DEFAULT_ENGAGEMENT_DAYS = "30";

export function newDraft(uid: string, option: FieldOption): DraftCondition {
  return {
    uid,
    fieldId: option.id,
    operator: operatorsFor(option)[0],
    text: option.kind === "ENGAGEMENT" ? DEFAULT_ENGAGEMENT_DAYS : "",
    statuses: option.kind === "STATUS" ? ["SUBSCRIBED"] : [],
    listId: "",
    campaignId: "",
  };
}

export function draftFromCondition(uid: string, c: SegmentCondition): DraftCondition {
  const v = c.value;
  return {
    uid,
    fieldId: c.field === "attribute" ? `attr:${c.key}` : c.field,
    operator: c.operator,
    text: typeof v === "string" || typeof v === "number" ? String(v) : "",
    statuses: Array.isArray(v) ? v : [],
    listId: c.field === "list" && typeof v === "string" ? v : "",
    campaignId: c.field === "engagement" && isEngagementCampaignOperator(c.operator) && typeof v === "string" ? v : "",
  };
}

/** Builds the condition to send to the server (which checks it again). */
export function draftToCondition(d: DraftCondition, kind: FieldKind): SegmentCondition {
  const { field, key } = fieldOf(d.fieldId);
  const base = (field === "attribute" ? { field, key, operator: d.operator } : { field, operator: d.operator }) as SegmentCondition;

  switch (valueInputKind(kind, d.operator)) {
    case "none":
      return base;
    case "statuses":
      return { ...base, value: d.statuses };
    case "list":
      return { ...base, value: d.listId };
    case "campaign":
      return { ...base, value: d.campaignId };
    default:
      // Numbers and days are sent as typed; the checker turns them into numbers.
      return { ...base, value: d.text };
  }
}
