import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const BASE = "/contacts/suppression";

/** "Showing 51–100 of 230" with Previous / Next links that keep the filters. */
export function SuppressionPagination({
  page,
  pageCount,
  total,
  pageSize,
  query,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  /** The current filters (without page), e.g. { q: "gmail", reason: "complaint" }. */
  query: Record<string, string>;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const hrefFor = (target: number) => {
    const params = new URLSearchParams(query);
    if (target > 1) params.set("page", String(target));
    const search = params.toString();
    return search ? `${BASE}?${search}` : BASE;
  };

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-col gap-3 text-sm text-zinc-500 sm:flex-row sm:items-center sm:justify-between"
    >
      <p>
        Showing <span className="font-medium text-zinc-900">{from.toLocaleString("en")}</span>–
        <span className="font-medium text-zinc-900">{to.toLocaleString("en")}</span> of{" "}
        <span className="font-medium text-zinc-900">{total.toLocaleString("en")}</span>
      </p>
      {pageCount > 1 && (
        <div className="flex items-center gap-2">
          <PageLink href={hrefFor(page - 1)} disabled={page <= 1}>
            <ChevronLeft aria-hidden />
            Previous
          </PageLink>
          <span className="px-1 tabular-nums">
            Page {page} of {pageCount}
          </span>
          <PageLink href={hrefFor(page + 1)} disabled={page >= pageCount}>
            Next
            <ChevronRight aria-hidden />
          </PageLink>
        </div>
      )}
    </nav>
  );
}

function PageLink({ href, disabled, children }: { href: string; disabled: boolean; children: ReactNode }) {
  const className = cn(buttonVariants({ variant: "outline", size: "sm" }), "bg-white");
  if (disabled) {
    return (
      <span aria-disabled="true" className={cn(className, "pointer-events-none opacity-50")}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
