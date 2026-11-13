"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CopyIcon, Loader2Icon, PlusIcon, TriangleAlertIcon, UsersIcon } from "lucide-react";
import { Glyph } from "@/components/brand/glyph";
import { toast } from "sonner";
import {
  duplicateSegment,
  previewSegmentRules,
  saveSegment,
  type SegmentPreviewResult,
} from "@/app/actions/segments";
import { SegmentAiBox } from "@/components/ai/segment-ai-box";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { contactDisplayName } from "@/lib/contacts/common";
import {
  EMPTY_RULES,
  MAX_CONDITIONS,
  checkCondition,
  checkSegmentRules,
  describeSegmentRules,
  segmentRulesSchema,
  type SegmentRules,
} from "@/lib/segments/rules";
import { cn } from "@/lib/utils";
import { ConditionRow } from "./condition-row";
import { DeleteSegmentDialog } from "./delete-segment-dialog";
import {
  buildFieldOptions,
  draftFromCondition,
  draftToCondition,
  newDraft,
  type AttributeOption,
  type CampaignOption,
  type DraftCondition,
  type FieldOption,
  type ListOption,
} from "./draft";
import { StatusPill } from "./status-pill";

/** How long to wait after the last change before refreshing the preview. */
const PREVIEW_DELAY_MS = 400;

type Props = {
  /** Leave out to create a new segment. */
  segment?: { id: string; name: string; rules: unknown };
  attributes: AttributeOption[];
  lists: ListOption[];
  /** Sent campaigns, for the "Email activity" conditions. */
  campaigns: CampaignOption[];
};

export function SegmentBuilder({ segment, attributes, lists, campaigns }: Props) {
  const router = useRouter();

  // The saved rules came from the database. If they can't be read (very old
  // or hand-edited data), start from "everyone" and say so.
  const [initial] = useState(() => {
    const parsed = segmentRulesSchema.safeParse(segment?.rules ?? EMPTY_RULES);
    const rules = parsed.success ? parsed.data : EMPTY_RULES;
    const drafts = rules.conditions.map((c, i) => draftFromCondition(`c${i}`, c));
    // What "no unsaved changes" looks like, built the same way as below.
    const options = buildFieldOptions(attributes, drafts.map((d) => d.fieldId));
    const snapshot = segment
      ? JSON.stringify({ name: segment.name.trim(), rules: rulesFromDrafts(drafts, options, rules.match) })
      : null;
    return { rules, drafts, snapshot, unreadable: !parsed.success };
  });

  const [name, setName] = useState(segment?.name ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  const [match, setMatch] = useState<SegmentRules["match"]>(initial.rules.match);
  const [drafts, setDrafts] = useState<DraftCondition[]>(initial.drafts);
  // Only used to make unique row ids for React, inside event handlers.
  const nextUid = useRef(initial.rules.conditions.length);

  const fieldOptions = useMemo(
    () => buildFieldOptions(attributes, drafts.map((d) => d.fieldId)),
    [attributes, drafts],
  );
  const context = useMemo(
    () => ({
      attributeTypes: new Map(attributes.map((a) => [a.key, a.type])),
      listIds: new Set(lists.map((l) => l.id)),
    }),
    [attributes, lists],
  );

  // Turn the rows into rules, and check each row with the same checker the
  // server uses. The server checks again; this is just for quick feedback.
  const { rules, problems } = useMemo(() => {
    const rules = rulesFromDrafts(drafts, fieldOptions, match);
    const problems = rules.conditions.map((c) => {
      const result = checkCondition(c, context);
      return result.ok ? null : result.error;
    });
    return { rules, problems };
  }, [drafts, fieldOptions, context, match]);
  const ready = problems.every((p) => p === null);

  // ── Live preview (debounced) ────────────────────────────────────────────
  const rulesKey = JSON.stringify(rules);
  const [preview, setPreview] = useState<{ key: string; result: SegmentPreviewResult } | null>(null);
  const latestRequest = useRef(0);

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(async () => {
      const requestId = ++latestRequest.current;
      try {
        const result = await previewSegmentRules(JSON.parse(rulesKey));
        // Ignore answers to older requests that arrive late.
        if (requestId === latestRequest.current) setPreview({ key: rulesKey, result });
      } catch {
        if (requestId === latestRequest.current) {
          setPreview({ key: rulesKey, result: { ok: false, errors: ["Could not load the preview."] } });
        }
      }
    }, PREVIEW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [rulesKey, ready]);

  const previewIsCurrent = preview?.key === rulesKey;

  // ── Unsaved changes ─────────────────────────────────────────────────────
  const snapshot = JSON.stringify({ name: name.trim(), rules });
  const [savedSnapshot, setSavedSnapshot] = useState(initial.snapshot);
  const dirty = snapshot !== savedSnapshot;

  // ── Row editing ─────────────────────────────────────────────────────────
  function addCondition() {
    if (drafts.length >= MAX_CONDITIONS) return;
    const uid = `c${nextUid.current++}`;
    // Start new rows on "Status is Subscribed": the most common first filter.
    const option = fieldOptions.find((o) => o.id === (drafts.length === 0 ? "status" : "email"))!;
    setDrafts([...drafts, newDraft(uid, option)]);
  }

  function updateDraft(uid: string, next: DraftCondition) {
    setDrafts((current) => current.map((d) => (d.uid === uid ? next : d)));
  }

  function removeDraft(uid: string) {
    setDrafts((current) => current.filter((d) => d.uid !== uid));
  }

  // ── "Describe with AI" (new segments only) ──────────────────────────────
  // The AI's rules were already checked on the server; they replace the rows
  // here so the user can review them before saving.
  function applyAiSuggestion(suggestion: { name: string; rules: SegmentRules }) {
    setMatch(suggestion.rules.match);
    setDrafts(suggestion.rules.conditions.map((c) => draftFromCondition(`c${nextUid.current++}`, c)));
    if (!name.trim() && suggestion.name) setName(suggestion.name.slice(0, 100));
    setNameError(null);
  }

  // ── Save / duplicate ────────────────────────────────────────────────────
  const [saving, startSaving] = useTransition();
  const [duplicating, startDuplicating] = useTransition();

  function save(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setNameError("Give your segment a name.");
      return;
    }
    startSaving(async () => {
      const result = await saveSegment({ id: segment?.id, name, rules });
      if (!result.ok) {
        setNameError(result.nameError ?? null);
        toast.error(result.ruleErrors?.[0] ?? result.error);
        return;
      }
      setNameError(null);
      setSavedSnapshot(snapshot);
      toast.success(segment ? "Segment saved." : "Segment created.");
      if (!segment) router.push(`/contacts/segments/${result.id}`);
    });
  }

  function duplicate() {
    if (!segment) return;
    startDuplicating(async () => {
      const result = await duplicateSegment(segment.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Copy created. You're now editing the copy.");
      router.push(`/contacts/segments/${result.id}`);
    });
  }

  const attributeLabels = useMemo(() => new Map(attributes.map((a) => [a.key, a.label])), [attributes]);
  const listNames = useMemo(() => new Map(lists.map((l) => [l.id, l.name])), [lists]);
  const campaignNames = useMemo(() => new Map(campaigns.map((c) => [c.id, c.name])), [campaigns]);
  // Describe the cleaned-up rules (numbers as numbers, trimmed text) once they're valid.
  const summary = useMemo(() => {
    const checked = checkSegmentRules(rules, context);
    return describeSegmentRules(checked.ok ? checked.rules : rules, { attributeLabels, listNames, campaignNames });
  }, [rules, context, attributeLabels, listNames, campaignNames]);

  return (
    <form onSubmit={save} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <div className="flex min-w-0 flex-col gap-6">
        {initial.unreadable && (
          <p className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
            The saved conditions of this segment couldn&apos;t be read, so they were cleared. Add them again and
            save.
          </p>
        )}

        {!segment && <SegmentAiBox onApply={applyAiSuggestion} />}

        {/* Name */}
        <section className="rounded-xl border bg-white p-5">
          <div className="grid gap-1.5">
            <Label htmlFor="segment-name">Segment name</Label>
            <Input
              id="segment-name"
              value={name}
              maxLength={100}
              placeholder="e.g. Subscribers in Pune"
              autoComplete="off"
              aria-invalid={nameError ? true : undefined}
              onChange={(e) => {
                setName(e.target.value);
                setNameError(null);
              }}
            />
            {nameError && <p className="text-xs text-red-600">{nameError}</p>}
          </div>
        </section>

        {/* Conditions */}
        <section className="rounded-xl border bg-white">
          <div className="flex flex-wrap items-center gap-2 border-b px-5 py-4 text-sm text-zinc-700">
            <span>Contacts that match</span>
            <div role="radiogroup" aria-label="How conditions combine" className="inline-flex rounded-lg border p-0.5">
              {(["all", "any"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={match === value}
                  onClick={() => setMatch(value)}
                  className={cn(
                    "rounded-md px-3 py-1 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-emerald-500/40",
                    match === value ? "bg-emerald-600 text-white" : "text-zinc-600 hover:bg-zinc-100",
                  )}
                >
                  {value === "all" ? "All" : "Any"}
                </button>
              ))}
            </div>
            <span>of these conditions</span>
          </div>

          <div className="flex flex-col gap-2 bg-zinc-50/60 p-4">
            {drafts.length === 0 && (
              <p className="rounded-lg border border-dashed bg-white px-4 py-6 text-center text-sm text-zinc-500">
                No conditions yet, so this segment includes <strong>everyone</strong> in your workspace.
              </p>
            )}
            {drafts.map((draft, index) => (
              <div key={draft.uid} className="flex flex-col gap-2">
                {index > 0 && (
                  <span className="self-start rounded bg-zinc-200/70 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-zinc-600 uppercase">
                    {match === "all" ? "and" : "or"}
                  </span>
                )}
                <ConditionRow
                  index={index}
                  draft={draft}
                  fieldOptions={fieldOptions}
                  lists={lists}
                  campaigns={campaigns}
                  problem={problems[index]}
                  onChange={(next) => updateDraft(draft.uid, next)}
                  onRemove={() => removeDraft(draft.uid)}
                />
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button type="button" variant="outline" onClick={addCondition} disabled={drafts.length >= MAX_CONDITIONS}>
                <PlusIcon />
                Add condition
              </Button>
              {drafts.length >= MAX_CONDITIONS && (
                <span className="text-xs text-zinc-500">A segment can have up to {MAX_CONDITIONS} conditions.</span>
              )}
            </div>
          </div>

          <p className="border-t px-5 py-3 text-xs text-zinc-500">
            Text matching ignores upper/lower case. “Is not” and “does not contain” also include contacts who
            have no value for that field. Dates use UTC. Email activity only counts real people: automatic
            opens by privacy scanners are ignored, and a click also counts as an open.
          </p>
        </section>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={saving || !ready}>
            {saving && <Loader2Icon className="animate-spin" />}
            {segment ? "Save changes" : "Create segment"}
          </Button>
          {segment && (
            <>
              <Button type="button" variant="outline" onClick={duplicate} disabled={duplicating}>
                <CopyIcon />
                {duplicating ? "Duplicating…" : "Duplicate"}
              </Button>
              <DeleteSegmentDialog segment={segment} redirectTo="/contacts/segments" />
            </>
          )}
          <Button variant="ghost" nativeButton={false} render={<Link href="/contacts/segments" />}>
            Cancel
          </Button>
          {segment && dirty && <span className="text-xs text-amber-700">Unsaved changes</span>}
          {!ready && <span className="text-xs text-zinc-500">Finish the highlighted conditions to save.</span>}
        </div>
      </div>

      {/* Live preview */}
      <aside className="rounded-xl border bg-white lg:sticky lg:top-6" aria-live="polite">
        <div className="border-b px-5 py-4">
          <h2 className="text-sm font-semibold text-zinc-900">Preview</h2>
          <p className="mt-1 text-xs break-words text-zinc-500">{summary}</p>
        </div>
        <PreviewBody ready={ready} current={previewIsCurrent} result={preview?.result ?? null} />
      </aside>
    </form>
  );
}

/** The rows as rules, in the format the server expects. */
function rulesFromDrafts(
  drafts: DraftCondition[],
  fieldOptions: FieldOption[],
  match: SegmentRules["match"],
): SegmentRules {
  const conditions = drafts.map((d) => {
    const kind = fieldOptions.find((o) => o.id === d.fieldId)?.kind ?? "TEXT";
    return draftToCondition(d, kind);
  });
  return { match, conditions };
}

function PreviewBody({
  ready,
  current,
  result,
}: {
  ready: boolean;
  current: boolean;
  result: SegmentPreviewResult | null;
}) {
  if (!ready) {
    return <p className="px-5 py-6 text-sm text-zinc-500">Finish the highlighted conditions to see who matches.</p>;
  }
  if (!result) {
    return (
      <p className="flex items-center gap-2 px-5 py-6 text-sm text-zinc-500">
        <Loader2Icon className="size-4 animate-spin" /> Counting contacts…
      </p>
    );
  }
  if (!result.ok) {
    return (
      <div className="px-5 py-6 text-sm text-red-600">
        {result.errors.map((e) => (
          <p key={e}>{e}</p>
        ))}
      </div>
    );
  }

  return (
    // Dim the old numbers while the new ones load.
    <div className={cn("transition-opacity", !current && "opacity-60")}>
      <div className="flex items-center gap-3 px-5 py-4">
        <Glyph icon={UsersIcon} size="lg" strokeWidth={1.5} />
        <div>
          <p className="text-2xl font-semibold text-zinc-900 tabular-nums">{result.count.toLocaleString()}</p>
          <p className="text-xs text-zinc-500">
            {result.count === 1 ? "contact matches" : "contacts match"}
            {!current && " (updating…)"}
          </p>
        </div>
      </div>
      {result.contacts.length > 0 && (
        <ul className="divide-y border-t">
          {result.contacts.map((c) => (
            <li key={c.id}>
              <Link
                href={`/contacts/${c.id}`}
                className="flex items-center gap-2 px-5 py-2.5 hover:bg-zinc-50 focus-visible:bg-zinc-50 focus-visible:outline-none"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-zinc-900">{contactDisplayName(c)}</span>
                  {(c.firstName || c.lastName) && <span className="block truncate text-xs text-zinc-500">{c.email}</span>}
                </span>
                <StatusPill status={c.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {result.count > result.contacts.length && (
        <p className="border-t px-5 py-3 text-xs text-zinc-500">
          Showing the {result.contacts.length} newest of {result.count.toLocaleString()}.
        </p>
      )}
    </div>
  );
}
