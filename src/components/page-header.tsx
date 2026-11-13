import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// The two building blocks every logged-in page uses, so titles, spacing and
// widths look the same everywhere:
//
//   <PageContainer>
//     <PageHeader title="Campaigns" description="…" actions={<Button>…</Button>} />
//     …page content…
//   </PageContainer>

/** Wraps every dashboard page so spacing and max width are the same everywhere. */
export function PageContainer({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-6 sm:px-6 md:py-10 lg:px-10", className)}>
      {children}
    </div>
  );
}

/**
 * Big page title, an optional one-line description underneath, and optional
 * buttons. On phones the buttons wrap below the title; from `sm` up they sit
 * on the right, lined up with the bottom of the text.
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1.5">
        {/* break-words: a long name (e.g. a segment's) wraps instead of overflowing. */}
        <h1 className="text-2xl font-semibold tracking-tight break-words text-zinc-900 sm:text-3xl">
          {title}
        </h1>
        {description && <p className="text-sm text-zinc-500 sm:text-base">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
