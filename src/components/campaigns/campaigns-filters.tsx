"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CAMPAIGN_STATUSES, CAMPAIGN_STATUS_META } from "@/lib/campaigns/status";

// Search box + status dropdown above the campaigns list. The filters live in
// the URL (?q=&status=), so a filtered view can be bookmarked, and the server
// does the filtering.

const ALL = "all";

export function CampaignsFilters({ q, status }: { q: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(q);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stop a pending search if the user leaves the page.
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function navigate(next: { q?: string; status?: string }) {
    const merged = { q: query, status, ...next };
    const params = new URLSearchParams();
    if (merged.q.trim()) params.set("q", merged.q.trim());
    if (merged.status) params.set("status", merged.status.toLowerCase());
    const search = params.toString();
    startTransition(() => {
      router.replace(search ? `/campaigns?${search}` : "/campaigns", { scroll: false });
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
    ...CAMPAIGN_STATUSES.map((s) => ({ value: s, label: CAMPAIGN_STATUS_META[s].label })),
  ];
  const hasFilters = Boolean(q || status);

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
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-zinc-400" aria-hidden />
        <Input
          type="search"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Search name or subject"
          aria-label="Search campaigns"
          maxLength={200}
          className="bg-white pl-8"
        />
      </form>

      <Select
        items={statusItems}
        value={status || ALL}
        onValueChange={(v) => navigate({ status: !v || v === ALL ? "" : v })}
      >
        <SelectTrigger aria-label="Filter by status" className="w-full bg-white sm:w-44">
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

      <div className="flex items-center gap-2">
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQuery("");
              if (timer.current) clearTimeout(timer.current);
              navigate({ q: "", status: "" });
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
