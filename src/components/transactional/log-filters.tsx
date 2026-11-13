"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, TagIcon, X } from "lucide-react";
import { filtersToSearch, hasFilters } from "@/components/transactional/filters";
import { TRANSACTIONAL_STATUS_META } from "@/components/transactional/status";
import type { KeyChoice, LogFilters } from "@/components/transactional/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TRANSACTIONAL_STATUSES } from "@/lib/transactional/schema";

// Filters above the logs list. They live in the URL (?status=&key=&to=&tag=),
// so a filtered view can be bookmarked or shared with a teammate, and the
// server does the filtering.

const ALL = "all";

export function LogFiltersBar({ filters, keys }: { filters: LogFilters; keys: KeyChoice[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [to, setTo] = useState(filters.to ?? "");
  const [tag, setTag] = useState(filters.tag ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The URL can change without typing here (a tag link, Back button): then show
  // its values in the boxes. If it's just catching up with what the user is
  // still typing ("rec" while the box says "receipt"), leave the box alone.
  const [prev, setPrev] = useState(filters);
  if (prev !== filters) {
    setPrev(filters);
    const sync = (next: string | null, current: string, set: (v: string) => void) => {
      if ((next ?? "") !== current.trim() && !current.trim().startsWith(next ?? "\0")) set(next ?? "");
    };
    if (filters.to !== prev.to) sync(filters.to, to, setTo);
    if (filters.tag !== prev.tag) sync(filters.tag, tag, setTag);
  }

  // Stop a pending search if the user leaves the page.
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function navigate(next: Partial<LogFilters>) {
    if (timer.current) clearTimeout(timer.current);
    const merged: LogFilters = { ...filters, to: to.trim() || null, tag: tag.trim() || null, ...next };
    startTransition(() => {
      router.replace(`/transactional${filtersToSearch(merged)}`, { scroll: false });
    });
  }

  /** Text boxes search once the user stops typing for a moment. */
  function later(next: Partial<LogFilters>) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => navigate(next), 450);
  }

  const statusItems = [
    { value: ALL, label: "All statuses" },
    ...TRANSACTIONAL_STATUSES.map((s) => ({ value: s, label: TRANSACTIONAL_STATUS_META[s].label })),
  ];
  const keyItems = [
    { value: ALL, label: "All API keys" },
    ...keys.map((k) => ({ value: k.id, label: k.revoked ? `${k.name} (revoked)` : k.name })),
  ];

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <form
        role="search"
        className="relative min-w-0 sm:w-64"
        onSubmit={(e) => {
          e.preventDefault();
          navigate({});
        }}
      >
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-zinc-400" aria-hidden />
        <Input
          type="search"
          inputMode="email"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            later({ to: e.target.value.trim() || null });
          }}
          placeholder="Recipient email"
          aria-label="Filter by recipient email (exact address)"
          maxLength={254}
          className="bg-white pl-8"
        />
      </form>

      <Select items={statusItems} value={filters.status ?? ALL} onValueChange={(v) => navigate({ status: !v || v === ALL ? null : (v as LogFilters["status"]) })}>
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

      {keys.length > 0 && (
        <Select items={keyItems} value={filters.key ?? ALL} onValueChange={(v) => navigate({ key: !v || v === ALL ? null : String(v) })}>
          <SelectTrigger aria-label="Filter by API key" className="w-full bg-white sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {keyItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <form
        className="relative min-w-0 sm:w-36"
        onSubmit={(e) => {
          e.preventDefault();
          navigate({});
        }}
      >
        <TagIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-zinc-400" aria-hidden />
        <Input
          value={tag}
          onChange={(e) => {
            setTag(e.target.value);
            later({ tag: e.target.value.trim() || null });
          }}
          placeholder="Tag"
          aria-label="Filter by tag"
          maxLength={50}
          className="bg-white pl-8"
        />
      </form>

      <div className="flex items-center gap-2">
        {hasFilters(filters) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setTo("");
              setTag("");
              navigate({ status: null, key: null, to: null, tag: null });
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
