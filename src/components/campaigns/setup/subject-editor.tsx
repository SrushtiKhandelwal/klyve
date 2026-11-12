"use client";

import { useId, useRef } from "react";
import { Braces } from "lucide-react";
import { MergeTagMenu } from "@/components/editor/controls";
import { Input } from "@/components/ui/input";
import type { MergeTag } from "@/lib/templates/document";
import { cn } from "@/lib/utils";

/** Inserts `text` where the cursor is (or at the end) and puts the cursor after it. */
function insertAtCursor(el: HTMLInputElement | null, value: string, text: string): string {
  if (!el) return value + text;
  const start = el.selectionStart ?? value.length;
  const end = el.selectionEnd ?? value.length;
  const next = value.slice(0, start) + text + value.slice(end);
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(start + text.length, start + text.length);
  });
  return next;
}

/** Fills merge tags with example values, e.g. "Hi {{ contact.FIRSTNAME }}" → "Hi Priya". */
export function withExamples(text: string, mergeTags: MergeTag[]): string {
  let out = text;
  for (const t of mergeTags) out = out.split(t.tag).join(t.example);
  // Anything left (a tag written by hand) gets a neutral placeholder.
  return out.replace(/\{\{[^}]*\}\}/g, "…");
}

/** Subject + preview text, each with "Insert personalization", a counter and an inbox preview. */
export function SubjectEditor({
  subject,
  preheader,
  onSubjectChange,
  onPreheaderChange,
  mergeTags,
  senderName,
  limits,
}: {
  subject: string;
  preheader: string;
  onSubjectChange: (v: string) => void;
  onPreheaderChange: (v: string) => void;
  mergeTags: MergeTag[];
  senderName: string;
  limits: { subjectMax: number; preheaderMax: number };
}) {
  // Links (unsubscribe, view in browser) make no sense in a subject line.
  const tags = mergeTags.filter((t) => !/_url/.test(t.tag));
  return (
    <div className="flex flex-col gap-5">
      <TextWithTags
        label="Subject line"
        value={subject}
        onChange={onSubjectChange}
        mergeTags={tags}
        max={limits.subjectMax}
        placeholder="e.g. Our biggest sale of the year starts now"
        hint={subject.length > 60 ? "Tip: under 60 characters is best, so it isn't cut off on phones." : "What people see first in their inbox."}
        hintTone={subject.length > 60 ? "amber" : "zinc"}
      />
      <TextWithTags
        label="Preview text"
        value={preheader}
        onChange={onPreheaderChange}
        mergeTags={tags}
        max={limits.preheaderMax}
        placeholder="e.g. Up to 50% off, this weekend only"
        hint="The short line shown after the subject in most inboxes. Optional, but it helps people open."
      />
      <InboxPreview senderName={senderName} subject={withExamples(subject, mergeTags)} preheader={withExamples(preheader, mergeTags)} />
    </div>
  );
}

function TextWithTags({
  label,
  value,
  onChange,
  mergeTags,
  max,
  placeholder,
  hint,
  hintTone = "zinc",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  mergeTags: MergeTag[];
  max: number;
  placeholder: string;
  hint: string;
  hintTone?: "zinc" | "amber";
}) {
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-zinc-900">
          {label}
        </label>
        <MergeTagMenu mergeTags={mergeTags} finalFocus={ref} onInsert={(tag) => onChange(insertAtCursor(ref.current, value, tag).slice(0, max))}>
          <span className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50">
            <Braces className="size-3.5" aria-hidden />
            Personalize
          </span>
        </MergeTagMenu>
      </div>
      <Input
        ref={ref}
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={max}
        placeholder={placeholder}
        autoComplete="off"
        aria-describedby={`${id}-hint`}
        className="h-9"
      />
      <div id={`${id}-hint`} className="flex items-start justify-between gap-3 text-xs">
        <p className={hintTone === "amber" ? "text-amber-700" : "text-zinc-500"}>{hint}</p>
        <span className={cn("shrink-0 tabular-nums", value.length > max * 0.9 ? "text-amber-700" : "text-zinc-400")}>
          {value.length}/{max}
        </span>
      </div>
    </div>
  );
}

/** A pretend inbox row, so people see how the subject and preview text read together. */
export function InboxPreview({ senderName, subject, preheader }: { senderName: string; subject: string; preheader: string }) {
  const initial = (senderName.trim()[0] ?? "?").toUpperCase();
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium text-zinc-500">Inbox preview (with sample details)</p>
      <div className="flex items-start gap-3 rounded-lg border bg-zinc-50/70 p-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-semibold text-white" aria-hidden>
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-sm font-semibold text-zinc-900">{senderName || "Your sender"}</p>
            <span className="shrink-0 text-xs text-zinc-400">now</span>
          </div>
          <p className="truncate text-sm font-medium text-zinc-800">{subject || <span className="text-zinc-400">(no subject)</span>}</p>
          <p className="truncate text-sm text-zinc-500">{preheader || <span className="text-zinc-400">Preview text appears here</span>}</p>
        </div>
      </div>
    </div>
  );
}
