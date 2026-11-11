import Form from "next/form";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatCount } from "./format";

/** Builds a link to the list page with the given search + page in the URL. */
function membersHref(listId: string, q: string, page: number) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/contacts/lists/${listId}${query ? `?${query}` : ""}`;
}

/**
 * Search box for a list's members. It's a normal GET form: submitting puts
 * `?q=...` in the URL and the server does the searching. Searching always
 * starts again from page 1 (the form has no `page` field).
 */
export function MembersSearch({ listId, q }: { listId: string; q: string }) {
  return (
    <Form action={`/contacts/lists/${listId}`} className="flex w-full items-center gap-2 sm:max-w-xs">
      <div className="relative w-full">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-zinc-400"
          aria-hidden
        />
        <Input
          // key: when the URL's q changes (e.g. "Clear"), show the new value.
          key={q}
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search name or email"
          aria-label="Search members by name or email"
          maxLength={200}
          className="pl-8"
        />
      </div>
      {q && (
        <Link
          href={membersHref(listId, "", 1)}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "shrink-0")}
        >
          Clear
        </Link>
      )}
      {/* Enter submits; this button is for screen readers and keyboard users. */}
      <button type="submit" className="sr-only">
        Search
      </button>
    </Form>
  );
}

/** "Showing 51–100 of 340" with Previous / Next links. */
export function MembersPagination({
  listId,
  q,
  page,
  pageCount,
  total,
  pageSize,
}: {
  listId: string;
  q: string;
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const linkClass = buttonVariants({ variant: "outline", size: "sm" });
  const disabledClass = cn(linkClass, "pointer-events-none opacity-50");

  return (
    <nav
      aria-label="Members pages"
      className="flex flex-col gap-3 border-t px-4 py-3 text-sm text-zinc-500 sm:flex-row sm:items-center sm:justify-between"
    >
      <p>
        Showing <span className="font-medium text-zinc-900">{formatCount(from)}</span>–
        <span className="font-medium text-zinc-900">{formatCount(to)}</span> of{" "}
        <span className="font-medium text-zinc-900">{formatCount(total)}</span>
      </p>
      {pageCount > 1 && (
        <div className="flex items-center gap-2">
          {page > 1 ? (
            <Link href={membersHref(listId, q, page - 1)} className={linkClass}>
              <ChevronLeft aria-hidden />
              Previous
            </Link>
          ) : (
            <span className={disabledClass} aria-disabled>
              <ChevronLeft aria-hidden />
              Previous
            </span>
          )}
          <span className="px-1 whitespace-nowrap">
            Page {formatCount(page)} of {formatCount(pageCount)}
          </span>
          {page < pageCount ? (
            <Link href={membersHref(listId, q, page + 1)} className={linkClass}>
              Next
              <ChevronRight aria-hidden />
            </Link>
          ) : (
            <span className={disabledClass} aria-disabled>
              Next
              <ChevronRight aria-hidden />
            </span>
          )}
        </div>
      )}
    </nav>
  );
}
