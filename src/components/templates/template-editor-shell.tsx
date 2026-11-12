"use client";

import { useRef, useState, useTransition, type KeyboardEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { renameTemplateAction, saveTemplateAction } from "@/app/actions/templates";
import { EmailEditor } from "@/components/editor/email-editor";
import { SendTestDialog, type SenderOption } from "@/components/templates/send-test-dialog";
import type { BrandTheme, EmailDocument, MergeTag } from "@/lib/templates/document";

/**
 * Connects the drag-and-drop editor to this template: saving, renaming and
 * sending tests all go through the template Server Actions.
 */
export function TemplateEditorShell({
  templateId,
  name,
  document,
  subject,
  preheader,
  theme,
  mergeTags,
  senders,
  userEmail,
}: {
  templateId: string;
  name: string;
  document: EmailDocument;
  subject: string;
  preheader: string;
  theme: BrandTheme;
  mergeTags: MergeTag[];
  senders: SenderOption[];
  userEmail: string;
}) {
  const [testOpen, setTestOpen] = useState(false);

  async function handleSave(input: { document: EmailDocument; subject: string; preheader: string }) {
    try {
      const result = await saveTemplateAction(templateId, input);
      return result.ok ? ({ ok: true } as const) : ({ ok: false, error: result.error } as const);
    } catch {
      return { ok: false, error: "Couldn't reach the server. Your changes are not saved yet." } as const;
    }
  }

  return (
    <>
      <EmailEditor
        initialDocument={document}
        theme={theme}
        mergeTags={mergeTags}
        subject={subject}
        preheader={preheader}
        onSave={handleSave}
        onSendTest={() => setTestOpen(true)}
        headerSlot={
          <div className="flex min-w-0 items-center gap-1.5">
            <Link
              href="/templates"
              aria-label="Back to templates"
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
            >
              <ArrowLeft className="size-4" aria-hidden />
            </Link>
            <InlineName templateId={templateId} initialName={name} />
          </div>
        }
      />
      <SendTestDialog
        templateId={templateId}
        senders={senders}
        defaultTo={userEmail}
        open={testOpen}
        onOpenChange={setTestOpen}
      />
    </>
  );
}

/** The template's name; click it to rename right there. Enter saves, Esc cancels. */
function InlineName({ templateId, initialName }: { templateId: string; initialName: string }) {
  const [name, setName] = useState(initialName);
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  // Stops the blur that follows Enter/Escape from saving a second time.
  const doneRef = useRef(false);

  function startEditing() {
    doneRef.current = false;
    setEditing(true);
    requestAnimationFrame(() => inputRef.current?.select());
  }

  function commit(value: string) {
    if (doneRef.current) return;
    doneRef.current = true;
    setEditing(false);
    const next = value.trim();
    if (!next || next === name) return;
    const previous = name;
    setName(next); // show the new name straight away
    startTransition(async () => {
      try {
        const result = await renameTemplateAction(templateId, next);
        if (!result.ok) {
          setName(previous);
          toast.error(result.error);
        }
      } catch {
        setName(previous);
        toast.error("Couldn't reach the server. The name wasn't changed.");
      }
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commit(event.currentTarget.value);
    } else if (event.key === "Escape") {
      doneRef.current = true;
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        defaultValue={name}
        autoFocus
        maxLength={100}
        aria-label="Template name"
        onKeyDown={onKeyDown}
        onBlur={(e) => commit(e.currentTarget.value)}
        className="h-8 w-full max-w-64 min-w-0 rounded-md border border-emerald-500 bg-white px-2 text-sm font-medium text-zinc-900 ring-3 ring-emerald-500/20 outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      title="Rename"
      className="group inline-flex h-8 min-w-0 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100"
    >
      <span className="truncate">{name}</span>
      {pending ? (
        <Loader2 className="size-3.5 shrink-0 animate-spin text-zinc-400" aria-hidden />
      ) : (
        <Pencil className="size-3.5 shrink-0 text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
      )}
    </button>
  );
}
