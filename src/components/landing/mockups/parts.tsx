import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import "@/components/landing/landing.css";

// Small building blocks for the product mock-ups on the landing page.
//
// The mock-ups are drawn with plain HTML and CSS (no screenshots), so they
// stay sharp at every size and cost no image download. They copy the real
// app's look: white panels, zinc text and emerald accents.
//
// Every mock-up is decorative: the outer element is role="img" with a one
// sentence aria-label, and everything inside is hidden from screen readers.

/** The outer frame of a mock-up: a white card with a soft emerald-tinted shadow. */
export function MockFrame({
  label,
  className,
  children,
}: {
  /** What the picture shows, read out by screen readers instead of the contents. */
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="img"
      aria-label={label}
      className={cn(
        "relative overflow-hidden rounded-2xl border border-zinc-200/90 bg-white text-left shadow-[0_1px_2px_rgb(0_0_0/0.04),0_20px_48px_-24px_rgb(0_0_0/0.16)]",
        className,
      )}
    >
      <div aria-hidden="true">{children}</div>
    </div>
  );
}

/** The title row at the top of a mock-up panel. */
export function MockHeader({ title, aside, className }: { title: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3", className)}>
      <div className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-zinc-900">{title}</div>
      {aside && <div className="shrink-0">{aside}</div>}
    </div>
  );
}

/** A status: coloured dot + text. (Deliberately not a pill.) */
export function StatusDot({
  tone = "emerald",
  pulse = false,
  children,
}: {
  tone?: "emerald" | "amber" | "zinc";
  pulse?: boolean;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-zinc-600">
      <span className="relative flex size-1.5">
        {pulse && (
          <span className="absolute inset-0 rounded-full bg-emerald-400 opacity-75 motion-safe:animate-ping" />
        )}
        <span
          className={cn(
            "relative size-1.5 rounded-full",
            tone === "emerald" && "bg-emerald-500",
            tone === "amber" && "bg-amber-400",
            tone === "zinc" && "bg-zinc-300",
          )}
        />
      </span>
      {children}
    </span>
  );
}

/** A small button inside a mock-up (it only looks like one). */
export function MockButton({
  variant = "primary",
  className,
  children,
}: {
  variant?: "primary" | "outline";
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium whitespace-nowrap",
        variant === "primary"
          ? "bg-emerald-700 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.15)]"
          : "border border-zinc-200 bg-white text-zinc-700",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A fake form field: a label above a value in a bordered box. */
export function MockField({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="text-[11px] font-medium text-zinc-500">{label}</div>
      <div className="mt-1 flex h-8 items-center gap-2 rounded-md border border-zinc-200 bg-white px-2.5 text-[12px] text-zinc-800">
        {children}
      </div>
    </div>
  );
}

/**
 * The quiet backdrop a mock-up sits on: a faint dot grid that fades out at
 * the edges (no hard edges, so it never reads as "another box").
 */
export function MockStage({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("relative isolate", className)}>
      <div aria-hidden="true" className="pointer-events-none absolute -inset-10 -z-10 sm:-inset-16">
        <div className="absolute inset-0 klv-dots" />
      </div>
      {children}
    </div>
  );
}
