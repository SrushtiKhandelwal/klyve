"use client";

import type { CSSProperties, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";

// A plain <button type="submit"> for the public pages. It works with
// JavaScript switched off (the browser just submits the form). When
// JavaScript is on, it also shows a "working…" label and can't be
// double-clicked while the request is running.

export function SubmitButton({
  children,
  pendingLabel,
  style,
  variant = "solid",
}: {
  children: ReactNode;
  pendingLabel: string;
  /** Brand colours for the solid button (see brandButtonStyle). */
  style?: CSSProperties;
  variant?: "solid" | "outline";
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      style={variant === "solid" ? style : undefined}
      className={cn(
        "inline-flex h-11 w-full items-center justify-center rounded-lg px-5 text-sm font-medium transition outline-none focus-visible:ring-3 focus-visible:ring-zinc-400/50 disabled:opacity-60 sm:w-auto sm:min-w-44",
        variant === "solid"
          ? "shadow-xs hover:opacity-90"
          : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50",
      )}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
