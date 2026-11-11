"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import { CONTACT_STATUSES, CONTACT_STATUS_META } from "@/lib/contacts/common";
import type { ListOption } from "@/lib/contacts/lookups";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Search box + status and list dropdowns above the table. The filters live in
// the URL (?q=&status=&list=), so a filtered view can be bookmarked or shared,
// and the server does the actual filtering.

const ALL = "all";

export function ContactsTableFilters({
  q,
  status,
  listId,
  lists,
}: {
  q: string;
  status: string;
  listId: string;
  lists: ListOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(q);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stop a pending search if the user leaves the page.
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  /** Goes to /contacts with the new filters. Any filter change starts at page 1. */
  function navigate(next: { q?: string; status?: string; list?: string }) {
    const params = new URLSearchParams();
    const merged = { q: query, status, list: listId, ...next };
    if (merged.q.trim()) params.set("q", merged.q.trim());
    if (merged.status) params.set("status", merged.status.toLowerCase());
    if (merged.list) params.set("list", merged.list);
    const search = params.toString();
    startTransition(() => {
      router.replace(search ? `/contacts?${search}` : "/contacts", { scroll: false });
    });
  }

  function handleQueryChange(value: string) {
    setQuery(value);
    // Wait until the user stops typing for a moment before searching.
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => navigate({ q: value }), 350);
  }

  const statusItems = [
    { value: ALL, label: "All statuses" },
    ...CONTACT_STATUSES.map((s) => ({ value: s, label: CONTACT_STATUS_META[s].label })),
  ];
  const listItems = [{ value: ALL, label: "All lists" }, ...lists.map((l) => ({ value: l.id, label: l.name }))];
  const hasFilters = Boolean(q || status || listId);

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <form
        role="search"
        className="relative min-w-0 sm:w-72"
        onSubmit={(e) => {
          e.preventDefault();
          if (timer.current) clearTimeout(timer.current);
          navigate({ q: query });
        }}
      >
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-zinc-400" />
        <Input
          type="search"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Search name or email"
          aria-label="Search contacts"
          maxLength={200}
          className="bg-white pl-8"
        />
      </form>

      <div className="grid grid-cols-2 gap-2 sm:flex">
        <Select
          items={statusItems}
          value={status || ALL}
          onValueChange={(v) => navigate({ status: !v || v === ALL ? "" : v })}
        >
          <SelectTrigger aria-label="Filter by status" className="w-full bg-white sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statusItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          items={listItems}
          value={listItems.some((i) => i.value === listId) ? listId : ALL}
          onValueChange={(v) => navigate({ list: !v || v === ALL ? "" : v })}
        >
          <SelectTrigger aria-label="Filter by list" className="w-full min-w-0 bg-white sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {listItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQuery("");
              if (timer.current) clearTimeout(timer.current);
              navigate({ q: "", status: "", list: "" });
            }}
          >
            <X aria-hidden />
            Clear filters
          </Button>
        )}
        {pending && <Loader2 className="size-4 animate-spin text-zinc-400" aria-label="Loading" />}
      </div>
    </div>
  );
}
