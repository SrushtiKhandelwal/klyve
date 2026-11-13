"use client";

import Link from "next/link";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

// Small pieces shared by the AI features.

/** Shown instead of an AI form when GROQ_API_KEY isn't set on the server. */
export function AiNotSetUp({ className }: { className?: string }) {
  return (
    <div role="status" className={cn("flex gap-2.5 rounded-lg bg-zinc-50 px-3 py-2.5 text-sm text-zinc-600 ring-1 ring-zinc-200", className)}>
      <Info className="mt-0.5 size-4 shrink-0 text-zinc-400" aria-hidden />
      <p>
        AI isn&apos;t set up on this server yet. Ask the person who runs Klyve to add a Groq API key.{" "}
        <Link href="/settings/ai" className="font-medium text-emerald-700 underline-offset-2 hover:underline">
          About AI
        </Link>
      </p>
    </div>
  );
}

/** A red, friendly error line. */
export function AiErrorText({ message, className }: { message: string | null; className?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className={cn("rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700", className)}>
      {message}
    </p>
  );
}

/** A row of choices (like "Friendly / Professional / …"), keyboard friendly. */
export function ChoiceGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-0.5 rounded-lg border p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-3 py-1 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-emerald-500/40 disabled:opacity-50",
            value === o.value ? "bg-emerald-600 text-white" : "text-zinc-600 hover:bg-zinc-100",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Message for when the server couldn't be reached at all. */
export const OFFLINE_MESSAGE = "Couldn't reach the server. Please check your connection and try again.";
