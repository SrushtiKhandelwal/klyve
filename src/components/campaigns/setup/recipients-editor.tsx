"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Filter, List, Loader2, MinusCircle, Search, ShieldCheck, TriangleAlert } from "lucide-react";
import { getAudienceCountAction } from "@/app/actions/campaigns";
import { formatCount } from "@/components/campaigns/types";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { Audience } from "@/lib/campaigns/audience";
import { cn } from "@/lib/utils";

/**
 * A list or segment to pick, with how many SUBSCRIBED contacts it has on its
 * own (the live total below removes duplicates and exclusions). `count` is
 * null when a segment's rules no longer work.
 */
export type AudienceSource = { id: string; name: string; count: number | null; unit: "subscribed" | "match" };
export type AudienceSources = { lists: AudienceSource[]; segments: AudienceSource[] };

/** The live count: null while unknown, or an error to show instead. */
export type AudienceCountState =
  | { kind: "idle" }
  | { kind: "loading"; previous: number | null }
  | { kind: "ready"; recipients: number }
  | { kind: "error"; message: string };

/** Most lists/segments one audience may use (matches audienceSchema). */
const MAX_PER_KIND = 20;

/**
 * Keeps the "1,240 people will receive this" number up to date. Counting
 * runs on the server (segments can be big), a moment after the last change.
 */
export function useAudienceCount(audience: Audience, initial: number | null): AudienceCountState {
  const key = JSON.stringify(audience);
  // With no starting number, the key "" makes the effect below count straight away.
  const [state, setState] = useState<{ key: string; value: AudienceCountState }>(() =>
    initial === null ? { key: "", value: { kind: "idle" } } : { key, value: { kind: "ready", recipients: initial } },
  );

  useEffect(() => {
    if (state.key === key) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const result = await getAudienceCountAction(JSON.parse(key) as Audience);
        if (cancelled) return;
        setState({
          key,
          value: result.ok ? { kind: "ready", recipients: result.count.recipients } : { kind: "error", message: result.error },
        });
      } catch {
        if (!cancelled) setState({ key, value: { kind: "error", message: "Couldn't count recipients. Check your connection." } });
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key, state.key]);

  if (state.key !== key) {
    const previous = state.value.kind === "ready" ? state.value.recipients : state.value.kind === "loading" ? state.value.previous : null;
    return { kind: "loading", previous };
  }
  return state.value;
}

/** Picks who gets the campaign: lists/segments to send to, and optional exclusions. */
export function RecipientsEditor({
  audience,
  onChange,
  sources,
  count,
}: {
  audience: Audience;
  onChange: (next: Audience) => void;
  sources: AudienceSources;
  count: AudienceCountState;
}) {
  const hasExclusions = audience.excludeListIds.length + audience.excludeSegmentIds.length > 0;
  const [showExclude, setShowExclude] = useState(hasExclusions);
  const noSources = sources.lists.length === 0 && sources.segments.length === 0;

  if (noSources) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-medium">You don&apos;t have any lists or segments yet.</p>
        <p>Campaigns go to lists or segments of your contacts. Import contacts into a list first, then come back.</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <Link href="/contacts/import" className="font-medium underline underline-offset-2">
            Import contacts
          </Link>
          <Link href="/contacts/lists" className="font-medium underline underline-offset-2">
            Create a list
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium text-zinc-900">Send to</legend>
        <SourceChecklist
          idPrefix="include"
          sources={sources}
          selectedLists={audience.listIds}
          selectedSegments={audience.segmentIds}
          blockedLists={audience.excludeListIds}
          blockedSegments={audience.excludeSegmentIds}
          blockedReason="Already in “Don't send to”"
          onChange={(listIds, segmentIds) => onChange({ ...audience, listIds, segmentIds })}
        />
      </fieldset>

      {showExclude ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 flex items-center gap-1.5 text-sm font-medium text-zinc-900">
            <MinusCircle className="size-4 text-zinc-400" aria-hidden />
            Don&apos;t send to <span className="font-normal text-zinc-500">(optional)</span>
          </legend>
          <p className="mb-1 text-xs text-zinc-500">Anyone in these lists or segments is left out, even if they&apos;re also in one above.</p>
          <SourceChecklist
            idPrefix="exclude"
            sources={sources}
            selectedLists={audience.excludeListIds}
            selectedSegments={audience.excludeSegmentIds}
            blockedLists={audience.listIds}
            blockedSegments={audience.segmentIds}
            blockedReason="Already in “Send to”"
            onChange={(excludeListIds, excludeSegmentIds) => onChange({ ...audience, excludeListIds, excludeSegmentIds })}
          />
        </fieldset>
      ) : (
        <button
          type="button"
          onClick={() => setShowExclude(true)}
          className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-emerald-700 hover:underline"
        >
          <MinusCircle className="size-4" aria-hidden />
          Leave some people out
        </button>
      )}

      <AudienceTotal count={count} empty={audience.listIds.length + audience.segmentIds.length === 0} />
    </div>
  );
}

/** The big live number, plus the promise that unsubscribed people are never emailed. */
export function AudienceTotal({ count, empty }: { count: AudienceCountState; empty: boolean }) {
  let main;
  if (empty) {
    main = <p className="text-sm text-zinc-600">Choose at least one list or segment to see how many people will get this.</p>;
  } else if (count.kind === "error") {
    main = (
      <p role="alert" className="flex items-start gap-2 text-sm text-red-700">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        {count.message}
      </p>
    );
  } else {
    const n = count.kind === "ready" ? count.recipients : count.kind === "loading" ? count.previous : null;
    main = (
      <p className="flex items-center gap-2 text-sm text-zinc-700" aria-live="polite">
        {count.kind === "loading" && <Loader2 className="size-4 animate-spin text-emerald-600" aria-hidden />}
        {n === null ? (
          "Counting…"
        ) : (
          <span>
            <span className="text-lg font-semibold text-zinc-900 tabular-nums">{formatCount(n)}</span>{" "}
            subscribed {n === 1 ? "contact" : "contacts"} will receive this
          </span>
        )}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-emerald-100 bg-emerald-50/60 p-4">
      {main}
      <p className="flex items-start gap-1.5 text-xs text-zinc-500">
        <ShieldCheck className="mt-px size-3.5 shrink-0 text-emerald-600" aria-hidden />
        Unsubscribed, bounced and complained contacts are always left out, and someone in two lists gets just one email.
      </p>
    </div>
  );
}

/** Checkboxes for every list and segment, with each one's subscribed count. */
function SourceChecklist({
  idPrefix,
  sources,
  selectedLists,
  selectedSegments,
  blockedLists,
  blockedSegments,
  blockedReason,
  onChange,
}: {
  idPrefix: string;
  sources: AudienceSources;
  selectedLists: string[];
  selectedSegments: string[];
  /** Chosen on the other side (include vs exclude), so not selectable here. */
  blockedLists: string[];
  blockedSegments: string[];
  blockedReason: string;
  onChange: (listIds: string[], segmentIds: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const total = sources.lists.length + sources.segments.length;
  const q = query.trim().toLowerCase();
  const lists = useMemo(() => sources.lists.filter((s) => !q || s.name.toLowerCase().includes(q)), [sources.lists, q]);
  const segments = useMemo(() => sources.segments.filter((s) => !q || s.name.toLowerCase().includes(q)), [sources.segments, q]);

  function toggle(kind: "list" | "segment", id: string, checked: boolean) {
    const current = kind === "list" ? selectedLists : selectedSegments;
    const next = checked ? [...current, id] : current.filter((x) => x !== id);
    if (kind === "list") onChange(next, selectedSegments);
    else onChange(selectedLists, next);
  }

  return (
    <div className="flex flex-col gap-2">
      {total > 8 && (
        <div className="relative sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-zinc-400" aria-hidden />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a list or segment"
            aria-label="Find a list or segment"
            className="pl-8"
            maxLength={100}
          />
        </div>
      )}
      <div className="max-h-72 overflow-y-auto rounded-lg border">
        {lists.length + segments.length === 0 && <p className="px-3 py-4 text-sm text-zinc-500">Nothing matches “{query}”.</p>}
        {lists.length > 0 && (
          <Group label="Lists" icon={List}>
            {lists.map((s) => (
              <SourceRow
                key={s.id}
                id={`${idPrefix}-list-${s.id}`}
                source={s}
                checked={selectedLists.includes(s.id)}
                blocked={blockedLists.includes(s.id) ? blockedReason : null}
                full={!selectedLists.includes(s.id) && selectedLists.length >= MAX_PER_KIND}
                onChange={(checked) => toggle("list", s.id, checked)}
              />
            ))}
          </Group>
        )}
        {segments.length > 0 && (
          <Group label="Segments" icon={Filter}>
            {segments.map((s) => (
              <SourceRow
                key={s.id}
                id={`${idPrefix}-segment-${s.id}`}
                source={s}
                checked={selectedSegments.includes(s.id)}
                blocked={blockedSegments.includes(s.id) ? blockedReason : null}
                full={!selectedSegments.includes(s.id) && selectedSegments.length >= MAX_PER_KIND}
                onChange={(checked) => toggle("segment", s.id, checked)}
              />
            ))}
          </Group>
        )}
      </div>
    </div>
  );
}

function Group({ label, icon: Icon, children }: { label: string; icon: typeof List; children: ReactNode }) {
  return (
    <div role="group" aria-label={label}>
      <p className="sticky top-0 z-10 flex items-center gap-1.5 border-b bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-500">
        <Icon className="size-3.5" aria-hidden />
        {label}
      </p>
      <ul className="divide-y">{children}</ul>
    </div>
  );
}

function SourceRow({
  id,
  source,
  checked,
  blocked,
  full,
  onChange,
}: {
  id: string;
  source: AudienceSource;
  checked: boolean;
  blocked: string | null;
  full: boolean;
  onChange: (checked: boolean) => void;
}) {
  // A segment whose rules broke can still be UNticked, but not newly picked.
  const broken = source.count === null;
  const disabled = !!blocked || (!checked && (full || broken));
  const detail =
    blocked ??
    (broken
      ? "Rules need fixing"
      : source.unit === "subscribed"
        ? `${formatCount(source.count ?? 0)} subscribed`
        : `${formatCount(source.count ?? 0)} match`);
  return (
    <li>
      {/* The label wraps the checkbox, so clicking anywhere on the row toggles it. */}
      <label
        title={blocked ?? (full && !checked ? `You can pick up to ${MAX_PER_KIND}.` : undefined)}
        className={cn(
          "flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm",
          checked ? "bg-emerald-50/50" : "hover:bg-zinc-50",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <Checkbox id={id} checked={checked} disabled={disabled} onCheckedChange={(v) => onChange(v === true)} />
        <span className="min-w-0 flex-1 truncate font-medium text-zinc-800">{source.name}</span>
        <span className={cn("shrink-0 text-xs tabular-nums", broken && !blocked ? "text-red-600" : "text-zinc-500")}>{detail}</span>
      </label>
    </li>
  );
}
