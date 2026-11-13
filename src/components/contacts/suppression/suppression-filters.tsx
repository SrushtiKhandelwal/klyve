"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SUPPRESSION_REASONS, SUPPRESSION_REASON_META } from "@/lib/suppression/meta";

// Search box + reason dropdown. The filters live in the URL (?q=&reason=),
// so the server does the filtering and a filtered view can be bookmarked.

const BASE = "/contacts/suppression";
const ALL = "all";

export function SuppressionFilters({ q, reason }: { q: string; reason: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(q);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stop a pending search if the user leaves the page.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  /** Any filter change starts again at page 1. */
  function navigate(next: { q?: string; reason?: string }) {
    const merged = { q: query, reason, ...next };
    const params = new URLSearchParams();
    if (merged.q.trim()) params.set("q", merged.q.trim());
    if (merged.reason) params.set("reason", merged.reason.toLowerCase());
    const search = params.toString();
    startTransition(() => router.replace(search ? `${BASE}?${search}` : BASE, { scroll: false }));
  }

  function handleQueryChange(value: string) {
    setQuery(value);
    // Wait until the user stops typing for a moment before searching.
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => navigate({ q: value }), 350);
  }

  const reasonItems = [
    { value: ALL, label: "All reasons" },
    ...SUPPRESSION_REASONS.map((r) => ({ value: r, label: SUPPRESSION_REASON_META[r].label })),
  ];

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
          placeholder="Search email address"
          aria-label="Search the suppression list"
          maxLength={200}
          className="bg-white pl-8"
        />
      </form>

      <Select
        items={reasonItems}
        value={reason || ALL}
        onValueChange={(v) => navigate({ reason: !v || v === ALL ? "" : String(v) })}
      >
        <SelectTrigger aria-label="Filter by reason" className="w-full bg-white sm:w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {reasonItems.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-2">
        {(q || reason) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQuery("");
              if (timer.current) clearTimeout(timer.current);
              navigate({ q: "", reason: "" });
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
