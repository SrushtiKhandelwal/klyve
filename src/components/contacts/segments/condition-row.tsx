"use client";

import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CONTACT_STATUSES, CONTACT_STATUS_META } from "@/lib/contacts/common";
import {
  ENGAGEMENT_OPERATOR_HINTS,
  MAX_ENGAGEMENT_DAYS,
  OPERATOR_LABELS,
  type SegmentOperator,
} from "@/lib/segments/rules";
import { cn } from "@/lib/utils";
import {
  DEFAULT_ENGAGEMENT_DAYS,
  operatorsFor,
  valueInputKind,
  type CampaignOption,
  type DraftCondition,
  type FieldOption,
  type ListOption,
} from "./draft";

const GROUPS = ["Contact", "Lists", "Email activity", "Custom fields"] as const;

const sentDateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** One "field / operator / value" row in the rule builder. */
export function ConditionRow({
  index,
  draft,
  fieldOptions,
  lists,
  campaigns,
  problem,
  onChange,
  onRemove,
}: {
  index: number;
  draft: DraftCondition;
  fieldOptions: FieldOption[];
  lists: ListOption[];
  /** Sent campaigns, newest first, for "opened campaign X". */
  campaigns: CampaignOption[];
  /** Why this row isn't usable yet, e.g. "Enter a value." */
  problem: string | null;
  onChange: (next: DraftCondition) => void;
  onRemove: () => void;
}) {
  const option = fieldOptions.find((o) => o.id === draft.fieldId) ?? fieldOptions[0];
  // A deleted field's type is unknown, so just show the operator it had.
  const operators = option.missing ? [draft.operator] : operatorsFor(option);
  const inputKind = valueInputKind(option.kind, draft.operator);
  const label = `Condition ${index + 1}`;
  const isEngagement = option.kind === "ENGAGEMENT";
  const hint = isEngagement ? ENGAGEMENT_OPERATOR_HINTS[draft.operator] : undefined;
  // A saved condition may point at a campaign that's no longer in the picker.
  const campaignItems = campaigns.some((c) => c.id === draft.campaignId) || !draft.campaignId
    ? campaigns
    : [{ id: draft.campaignId, name: "Unknown campaign", sentAt: null }, ...campaigns];

  function changeField(fieldId: string) {
    const next = fieldOptions.find((o) => o.id === fieldId);
    if (!next) return;
    const nextOps = operatorsFor(next);
    // Keep the operator and typed value when they still make sense.
    const operator = nextOps.includes(draft.operator) ? draft.operator : nextOps[0];
    const nextInput = valueInputKind(next.kind, operator);
    const sameInput = next.kind === option.kind && nextInput === inputKind;
    onChange({
      ...draft,
      fieldId,
      operator,
      text: sameInput ? draft.text : startingText(next, nextInput),
      statuses: next.kind === "STATUS" && draft.statuses.length === 0 ? ["SUBSCRIBED"] : draft.statuses,
    });
  }

  function changeOperator(operator: SegmentOperator) {
    // "is before" needs a date but "in the last" needs a number: clear the box if it changes.
    const nextInput = valueInputKind(option.kind, operator);
    const sameInput = nextInput === inputKind;
    onChange({ ...draft, operator, text: sameInput ? draft.text : startingText(option, nextInput) });
  }

  function toggleStatus(status: string) {
    const statuses = draft.statuses.includes(status)
      ? draft.statuses.filter((s) => s !== status)
      : [...draft.statuses, status];
    onChange({ ...draft, statuses });
  }

  return (
    <div role="group" aria-label={label} className="rounded-lg border bg-white p-3">
      {/* Phone: field + remove button on top, operator and value below. Wider: one line. */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_auto] sm:items-start">
        {/* Field */}
        <Select
          items={fieldOptions.map((o) => ({ value: o.id, label: o.label }))}
          value={option.id}
          onValueChange={(v) => v && changeField(v)}
        >
          <SelectTrigger className="order-1 w-full" aria-label={`${label} field`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {GROUPS.map((group) => {
              const items = fieldOptions.filter((o) => o.group === group);
              if (items.length === 0) return null;
              return (
                <SelectGroup key={group}>
                  <SelectLabel>{group}</SelectLabel>
                  {items.map((o) => (
                    <SelectItem key={o.id} value={o.id} disabled={o.missing}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              );
            })}
          </SelectContent>
        </Select>

        {/* Operator */}
        <Select
          items={operators.map((op) => ({ value: op, label: OPERATOR_LABELS[op] }))}
          value={draft.operator}
          onValueChange={(v) => v && changeOperator(v as SegmentOperator)}
        >
          <SelectTrigger className="order-3 col-span-2 w-full sm:order-2 sm:col-span-1" aria-label={`${label} operator`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {operators.map((op) => (
              <SelectItem key={op} value={op}>
                {OPERATOR_LABELS[op]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Value (depends on the field type and operator) */}
        <div className="order-4 col-span-2 min-w-0 sm:order-3 sm:col-span-1">
          {inputKind === "text" && (
            <Input
              value={draft.text}
              maxLength={1000}
              placeholder="Value"
              aria-label={`${label} value`}
              onChange={(e) => onChange({ ...draft, text: e.target.value })}
            />
          )}
          {inputKind === "number" && (
            <Input
              type="number"
              step="any"
              inputMode="decimal"
              value={draft.text}
              placeholder="Number"
              aria-label={`${label} value`}
              onChange={(e) => onChange({ ...draft, text: e.target.value })}
            />
          )}
          {inputKind === "date" && (
            <Input
              type="date"
              value={draft.text}
              aria-label={`${label} date`}
              onChange={(e) => onChange({ ...draft, text: e.target.value })}
            />
          )}
          {inputKind === "days" && (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={isEngagement ? MAX_ENGAGEMENT_DAYS : 36500}
                step={1}
                inputMode="numeric"
                value={draft.text}
                placeholder="30"
                aria-label={`${label} number of days`}
                onChange={(e) => onChange({ ...draft, text: e.target.value })}
              />
              <span className="text-sm text-zinc-500">days</span>
            </div>
          )}
          {inputKind === "statuses" && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={`${label} statuses`}>
              {CONTACT_STATUSES.map((status) => {
                const on = draft.statuses.includes(status);
                return (
                  <button
                    key={status}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleStatus(status)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-emerald-500/40",
                      on
                        ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                        : "border-zinc-200 text-zinc-600 hover:bg-zinc-50",
                    )}
                  >
                    {CONTACT_STATUS_META[status].label}
                  </button>
                );
              })}
            </div>
          )}
          {inputKind === "list" &&
            (lists.length === 0 ? (
              <p className="py-1.5 text-sm text-zinc-500">You don&apos;t have any lists yet.</p>
            ) : (
              <Select
                items={lists.map((l) => ({ value: l.id, label: l.name }))}
                value={draft.listId || null}
                onValueChange={(v) => onChange({ ...draft, listId: v ?? "" })}
              >
                <SelectTrigger className="w-full" aria-label={`${label} list`}>
                  <SelectValue placeholder="Pick a list" />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  {lists.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ))}
          {inputKind === "campaign" &&
            (campaignItems.length === 0 ? (
              <p className="py-1.5 text-sm text-zinc-500">You haven&apos;t sent any campaigns yet.</p>
            ) : (
              <Select
                items={campaignItems.map((c) => ({ value: c.id, label: c.name }))}
                value={draft.campaignId || null}
                onValueChange={(v) => onChange({ ...draft, campaignId: v ?? "" })}
              >
                <SelectTrigger className="w-full" aria-label={`${label} campaign`}>
                  <SelectValue placeholder="Pick a campaign" className="truncate" />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  {campaignItems.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="min-w-0 truncate">{c.name}</span>
                      {c.sentAt && (
                        <span className="ml-auto shrink-0 text-xs text-zinc-500">
                          {sentDateFormat.format(new Date(c.sentAt))}
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ))}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          aria-label={`Remove condition ${index + 1}`}
          title="Remove condition"
          className="order-2 text-zinc-500 hover:text-red-600 sm:order-4"
        >
          <XIcon />
        </Button>
      </div>
      {hint && !problem && <p className="mt-2 text-xs text-zinc-500">{hint}</p>}
      {problem && <p className="mt-2 text-xs text-amber-700">{problem}</p>}
    </div>
  );
}

/** What a freshly shown value box starts with: 30 days for email activity, else empty. */
function startingText(option: FieldOption, input: ReturnType<typeof valueInputKind>): string {
  return option.kind === "ENGAGEMENT" && input === "days" ? DEFAULT_ENGAGEMENT_DAYS : "";
}
