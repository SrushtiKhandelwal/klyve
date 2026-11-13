"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, FilePlus2, LayoutTemplate, Loader2, Palette, Plus, Search, SearchX } from "lucide-react";
import { Glyph } from "@/components/brand/glyph";
import { toast } from "sonner";
import { createTemplateAction } from "@/app/actions/templates";
import { StarterCard } from "@/components/templates/starter-card";
import { TemplateCard, type TemplateCardData } from "@/components/templates/template-card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { StarterMeta } from "@/lib/templates/starters";
import { cn } from "@/lib/utils";

type Tab = "mine" | "starters";

/**
 * The /templates page body: "My templates" and "Starter templates" tabs,
 * search, category chips and the "New template" menu. Searching and
 * filtering happen right here in the browser (the lists are small).
 */
export function TemplatesGallery({
  templates,
  starters,
  categories,
  previewVersion,
}: {
  templates: TemplateCardData[];
  starters: StarterMeta[];
  categories: readonly string[];
  /** Changes when the brand kit changes, so starter previews reload. */
  previewVersion: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("mine");
  const [mineQuery, setMineQuery] = useState("");
  const [starterQuery, setStarterQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  // Which thing is being created right now: "blank", a starter id, or null.
  const [creating, setCreating] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function create(starterId: string | null) {
    setCreating(starterId ?? "blank");
    startTransition(async () => {
      try {
        const result = await createTemplateAction({ starterId });
        if (!result.ok) {
          toast.error(result.error);
          setCreating(null);
          return;
        }
        // Keep the spinner on while the editor opens.
        router.push(`/templates/${result.templateId}`);
      } catch {
        toast.error("Couldn't reach the server. Please try again.");
        setCreating(null);
      }
    });
  }

  const mine = useMemo(() => {
    const q = mineQuery.trim().toLowerCase();
    return q ? templates.filter((t) => `${t.name} ${t.subject}`.toLowerCase().includes(q)) : templates;
  }, [templates, mineQuery]);

  const shownStarters = useMemo(() => {
    const q = starterQuery.trim().toLowerCase();
    return starters.filter(
      (s) =>
        (!category || s.category === category) &&
        (!q || `${s.name} ${s.description} ${s.category}`.toLowerCase().includes(q)),
    );
  }, [starters, starterQuery, category]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
            Templates
            {templates.length > 0 && (
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-sm font-medium text-emerald-700 tabular-nums">
                {templates.length}
              </span>
            )}
          </h1>
          <p className="text-sm text-zinc-500 sm:text-base">Reusable email designs, in your brand.</p>
        </div>
        <NewTemplateMenu
          creating={creating === "blank"}
          disabled={creating !== null}
          onBlank={() => create(null)}
          onStarter={() => setTab("starters")}
        />
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)} className="gap-5">
        <TabsList>
          <TabsTrigger value="mine" className="px-3">
            My templates
          </TabsTrigger>
          <TabsTrigger value="starters" className="px-3">
            Starter templates
            <span className="rounded-full bg-zinc-200/70 px-1.5 text-xs tabular-nums">{starters.length}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="mine" className="flex flex-col gap-4">
          {templates.length === 0 ? (
            <MyTemplatesEmpty
              creatingBlank={creating === "blank"}
              disabled={creating !== null}
              onBlank={() => create(null)}
              onStarter={() => setTab("starters")}
            />
          ) : (
            <>
              <SearchBox value={mineQuery} onChange={setMineQuery} placeholder="Search your templates" />
              {mine.length === 0 ? (
                <NoMatches />
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
                  {mine.map((t) => (
                    <TemplateCard key={t.id} template={t} />
                  ))}
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="starters" className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 text-sm text-emerald-900 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2">
              <Palette className="size-4 shrink-0" aria-hidden />
              Every starter uses your brand&apos;s logo, colours, font and footer.
            </p>
            <Link href="/settings/brand" className="shrink-0 font-medium text-emerald-700 hover:underline">
              Edit brand settings
            </Link>
          </div>
          <SearchBox value={starterQuery} onChange={setStarterQuery} placeholder="Search starters, e.g. sale, event, welcome" />
          {/* Category chips scroll sideways on phones instead of wrapping into many rows. */}
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Filter by category">
            <Chip active={category === null} onClick={() => setCategory(null)}>
              All
            </Chip>
            {categories.map((c) => (
              <Chip key={c} active={category === c} onClick={() => setCategory(category === c ? null : c)}>
                {c}
              </Chip>
            ))}
          </div>
          {shownStarters.length === 0 ? (
            <NoMatches />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
              {shownStarters.map((s) => (
                <StarterCard
                  key={s.id}
                  starter={s}
                  previewVersion={previewVersion}
                  onUse={() => create(s.id)}
                  busy={creating === s.id}
                  disabled={creating !== null}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function NewTemplateMenu({
  creating,
  disabled,
  onBlank,
  onStarter,
}: {
  creating: boolean;
  disabled: boolean;
  onBlank: () => void;
  onStarter: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button disabled={disabled} />}>
        {creating ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
        New template
        <ChevronDown className="opacity-70" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuItem onClick={onBlank} className="items-start py-2">
          <FilePlus2 className="mt-0.5" aria-hidden />
          <span className="flex flex-col">
            <span className="font-medium">Blank</span>
            <span className="text-xs text-zinc-500">An empty email in your brand colours, with the footer ready.</span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onStarter} className="items-start py-2">
          <LayoutTemplate className="mt-0.5" aria-hidden />
          <span className="flex flex-col">
            <span className="font-medium">From a starter</span>
            <span className="text-xs text-zinc-500">Pick one of our ready-made designs.</span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/settings/brand" />} className="items-start py-2">
          <Palette className="mt-0.5" aria-hidden />
          <span className="flex flex-col">
            <span className="font-medium">Brand settings</span>
            <span className="text-xs text-zinc-500">Set your logo and colours to make every template match your brand.</span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MyTemplatesEmpty({
  creatingBlank,
  disabled,
  onBlank,
  onStarter,
}: {
  creatingBlank: boolean;
  disabled: boolean;
  onBlank: () => void;
  onStarter: () => void;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center sm:py-20">
      <Glyph icon={LayoutTemplate} size="xl" strokeWidth={1.5} className="size-10" />
      <h2 className="mt-5 text-lg font-semibold text-zinc-900">No templates yet</h2>
      <p className="mt-1.5 max-w-md text-sm text-zinc-500">
        Pick a ready-made starter (it&apos;s already in your brand) or design your own from scratch. You can reuse
        templates in every campaign.
      </p>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <Button onClick={onStarter} disabled={disabled}>
          <LayoutTemplate aria-hidden />
          Browse starters
        </Button>
        <Button variant="outline" onClick={onBlank} disabled={disabled}>
          {creatingBlank ? <Loader2 className="animate-spin" aria-hidden /> : <FilePlus2 aria-hidden />}
          Start blank
        </Button>
      </div>
      <Link href="/settings/brand" className="mt-5 text-sm font-medium text-emerald-700 hover:underline">
        Set up your brand first
      </Link>
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative w-full sm:max-w-sm">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-zinc-400" aria-hidden />
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="pl-8"
        maxLength={100}
      />
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "shrink-0 rounded-full border px-3 py-1 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-emerald-500/40",
        active
          ? "border-emerald-600 bg-emerald-600 text-white"
          : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900",
      )}
    >
      {children}
    </button>
  );
}

function NoMatches() {
  return (
    <div className="flex flex-col items-center rounded-xl border bg-white px-6 py-12 text-center">
      <SearchX className="size-8 text-zinc-400" aria-hidden />
      <p className="mt-3 font-medium text-zinc-900">Nothing matches your search</p>
      <p className="mt-1 text-sm text-zinc-500">Try a different word, or clear the filters.</p>
    </div>
  );
}
