"use client";

import { useRef, useState, useTransition, type KeyboardEvent } from "react";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { renameAutomationAction } from "@/app/actions/automations";

/** The automation's name; click it to rename right there. Enter saves, Esc cancels. Works in any status. */
export function InlineName({ automationId, initialName }: { automationId: string; initialName: string }) {
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
        const result = await renameAutomationAction(automationId, next);
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
        aria-label="Automation name"
        onKeyDown={onKeyDown}
        onBlur={(e) => commit(e.currentTarget.value)}
        className="h-9 w-full max-w-80 min-w-0 rounded-md border border-emerald-500 bg-white px-2 text-lg font-semibold text-zinc-900 ring-3 ring-emerald-500/20 outline-none"
      />
    );
  }

  return (
    <h1 className="min-w-0">
      <button
        type="button"
        onClick={startEditing}
        title="Rename"
        className="group inline-flex h-9 max-w-full min-w-0 items-center gap-1.5 rounded-md px-2 text-lg font-semibold text-zinc-900 hover:bg-zinc-100 sm:text-xl"
      >
        <span className="truncate">{name}</span>
        {pending ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-zinc-400" aria-hidden />
        ) : (
          <Pencil className="size-3.5 shrink-0 text-zinc-400 opacity-60 transition-opacity group-hover:opacity-100" aria-hidden />
        )}
      </button>
    </h1>
  );
}
