"use client";

import { useMemo, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, FilePlus2, LayoutTemplate, Loader2, Search, SearchX, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { createCampaignAction } from "@/app/actions/campaigns";
import { EmailThumbnail, SavedTemplateThumbnail } from "@/components/templates/email-thumbnail";
import { starterPreviewUrl } from "@/components/templates/starter-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { StarterMeta } from "@/lib/templates/starters";
import { cn } from "@/lib/utils";

export type TemplateChoice = { id: string; name: string; subject: string; updatedAt: string };

/** What the campaign's design starts from. The campaign gets its OWN copy of it. */
type Source = { kind: "blank" } | { kind: "template"; id: string; name: string } | { kind: "starter"; id: string; name: string };
type Tab = "mine" | "starters" | "blank";

const NAME_MAX = 100;

export function NewCampaignForm({
  templates,
  starters,
  categories,
  previewVersion,
}: {
  templates: TemplateChoice[];
  starters: StarterMeta[];
  categories: readonly string[];
  previewVersion: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [source, setSource] = useState<Source>({ kind: "blank" });
  const [tab, setTab] = useState<Tab>(templates.length > 0 ? "mine" : "starters");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Stays true after success while the next page opens, so nobody clicks twice.
  const [opening, setOpening] = useState(false);

  const q = query.trim().toLowerCase();
  const shownTemplates = useMemo(
    () => (q ? templates.filter((t) => `${t.name} ${t.subject}`.toLowerCase().includes(q)) : templates),
    [templates, q],
  );
  const shownStarters = useMemo(
    () =>
      starters.filter(
        (s) => (!category || s.category === category) && (!q || `${s.name} ${s.description} ${s.category}`.toLowerCase().includes(q)),
      ),
    [starters, category, q],
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError("Give your campaign a name. Only you and your team see it.");
      document.getElementById("campaign-name")?.focus();
      return;
    }
    setNameError(null);
    startTransition(async () => {
      try {
        const result = await createCampaignAction({
          name: trimmed,
          templateId: source.kind === "template" ? source.id : undefined,
          starterId: source.kind === "starter" ? source.id : undefined,
        });
        if (!result.ok) return void toast.error(result.error);
        setOpening(true);
        router.push(`/campaigns/${result.id}`);
      } catch {
        toast.error("Couldn't reach the server. Please try again.");
      }
    });
  }

  const busy = pending || opening;
  const sourceLabel =
    source.kind === "blank" ? "A blank email in your brand" : source.kind === "template" ? `Your template “${source.name}”` : `The “${source.name}” starter`;

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-8">
      <section className="flex flex-col gap-2 rounded-xl border bg-white p-5">
        <Label htmlFor="campaign-name" className="text-base font-semibold text-zinc-900">
          Campaign name
        </Label>
        <p className="text-sm text-zinc-500">For you and your team only. Subscribers never see it.</p>
        <Input
          id="campaign-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (nameError) setNameError(null);
          }}
          placeholder="e.g. November newsletter"
          maxLength={NAME_MAX}
          autoFocus
          autoComplete="off"
          disabled={busy}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? "campaign-name-error" : undefined}
          className="mt-1 h-9 max-w-md"
        />
        {nameError && (
          <p id="campaign-name-error" role="alert" className="text-sm text-destructive">
            {nameError}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="design-heading">
        <div>
          <h2 id="design-heading" className="text-base font-semibold text-zinc-900">
            Start from…
          </h2>
          <p className="text-sm text-zinc-500">The campaign gets its own copy, so editing it never changes the template.</p>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="gap-4">
          <TabsList className="max-w-full overflow-x-auto">
            <TabsTrigger value="mine" className="px-3">
              My templates
              <span className="rounded-full bg-zinc-200/70 px-1.5 text-xs tabular-nums">{templates.length}</span>
            </TabsTrigger>
            <TabsTrigger value="starters" className="px-3">
              Starters
              <span className="rounded-full bg-zinc-200/70 px-1.5 text-xs tabular-nums">{starters.length}</span>
            </TabsTrigger>
            <TabsTrigger value="blank" className="px-3">
              Blank
            </TabsTrigger>
          </TabsList>

          <TabsContent value="mine" className="flex flex-col gap-4">
            {templates.length === 0 ? (
              <div className="flex flex-col items-center rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center">
                <LayoutTemplate className="size-8 text-zinc-400" aria-hidden />
                <p className="mt-3 font-medium text-zinc-900">You haven&apos;t saved any templates yet</p>
                <p className="mt-1 max-w-sm text-sm text-zinc-500">Pick one of our starters instead. It&apos;s already in your brand.</p>
                <Button type="button" variant="outline" className="mt-4" onClick={() => setTab("starters")}>
                  Browse starters
                </Button>
              </div>
            ) : (
              <>
                <SearchBox value={query} onChange={setQuery} placeholder="Search your templates" />
                {shownTemplates.length === 0 ? (
                  <NoMatches />
                ) : (
                  <div role="group" aria-label="Your templates" className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
                    {shownTemplates.map((t) => (
                      <ChoiceCard
                        key={t.id}
                        selected={source.kind === "template" && source.id === t.id}
                        disabled={busy}
                        onSelect={() => setSource({ kind: "template", id: t.id, name: t.name })}
                        title={t.name}
                        subtitle={t.subject || "No subject"}
                        preview={<SavedTemplateThumbnail id={t.id} version={t.updatedAt} title={`Preview of ${t.name}`} />}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="starters" className="flex flex-col gap-4">
            <SearchBox value={query} onChange={setQuery} placeholder="Search starters, e.g. sale, event, welcome" />
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
              <div role="group" aria-label="Starter designs" className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
                {shownStarters.map((s) => (
                  <ChoiceCard
                    key={s.id}
                    selected={source.kind === "starter" && source.id === s.id}
                    disabled={busy}
                    onSelect={() => setSource({ kind: "starter", id: s.id, name: s.name })}
                    eyebrow={s.category}
                    title={s.name}
                    subtitle={s.description}
                    preview={<EmailThumbnail src={starterPreviewUrl(s.id, previewVersion)} title={`Preview of ${s.name}`} />}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="blank">
            <button
              type="button"
              aria-pressed={source.kind === "blank"}
              disabled={busy}
              onClick={() => setSource({ kind: "blank" })}
              className={cn(
                "flex w-full max-w-md items-start gap-4 rounded-xl border bg-white p-5 text-left transition outline-none focus-visible:ring-3 focus-visible:ring-emerald-500/40",
                source.kind === "blank" ? "border-emerald-500 ring-2 ring-emerald-500/30" : "hover:border-zinc-300",
              )}
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <FilePlus2 className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-zinc-900">Blank email</span>
                <span className="mt-0.5 block text-sm text-zinc-500">
                  An empty email in your brand colours, with the unsubscribe footer ready. Build it in the drag-and-drop editor.
                </span>
              </span>
              {source.kind === "blank" && <SelectedTick />}
            </button>
          </TabsContent>
        </Tabs>
      </section>

      {/* Stays in view while scrolling the gallery, so the next step is always one tap away. */}
      <div className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-3 border-t bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:flex-row sm:items-center sm:justify-between sm:rounded-xl sm:border sm:px-5">
        <p className="flex min-w-0 items-center gap-2 text-sm text-zinc-600">
          <Sparkles className="size-4 shrink-0 text-emerald-600" aria-hidden />
          <span className="min-w-0 truncate">
            Starting from: <span className="font-medium text-zinc-900">{sourceLabel}</span>
          </span>
        </p>
        <Button type="submit" size="lg" disabled={busy} className="px-4">
          {busy && <Loader2 className="animate-spin" aria-hidden />}
          Create campaign
        </Button>
      </div>
    </form>
  );
}

function ChoiceCard({
  selected,
  disabled,
  onSelect,
  eyebrow,
  title,
  subtitle,
  preview,
}: {
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
  eyebrow?: string;
  title: string;
  subtitle: string;
  preview: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={title}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "relative flex flex-col overflow-hidden rounded-xl border bg-white text-left transition outline-none focus-visible:ring-3 focus-visible:ring-emerald-500/40 disabled:opacity-60",
        selected ? "border-emerald-500 ring-2 ring-emerald-500/30" : "hover:border-zinc-300 hover:shadow-md",
      )}
    >
      <div className="border-b">{preview}</div>
      <div className="flex min-w-0 flex-col p-3">
        {eyebrow && <span className="text-xs font-medium text-emerald-700">{eyebrow}</span>}
        <span className="truncate font-medium text-zinc-900">{title}</span>
        <span className="line-clamp-2 text-xs text-zinc-500">{subtitle}</span>
      </div>
      {selected && (
        <span className="absolute top-2 right-2">
          <SelectedTick />
        </span>
      )}
    </button>
  );
}

function SelectedTick() {
  return (
    <span className="flex size-6 items-center justify-center rounded-full bg-emerald-600 text-white shadow">
      <Check className="size-3.5" aria-hidden />
      <span className="sr-only">Selected</span>
    </span>
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
        className="bg-white pl-8"
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
        active ? "border-emerald-600 bg-emerald-600 text-white" : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900",
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
