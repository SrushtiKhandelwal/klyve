"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CircleAlert,
  Copy,
  ExternalLink,
  ListChecks,
  Loader2,
  Monitor,
  MoreHorizontal,
  Paintbrush,
  PartyPopper,
  Pencil,
  Power,
  Share2,
  Smartphone,
  TextCursorInput,
  Trash2,
  Type,
} from "lucide-react";
import { toast } from "sonner";
import { duplicateFormAction } from "@/app/actions/forms";
import { SaveIndicator } from "@/components/campaigns/setup/setup-section";
import { DeleteFormDialog } from "@/components/forms/delete-form-dialog";
import { FormStatusBadge } from "@/components/forms/form-status-badge";
import { FormView } from "@/components/forms/form-view";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formConfigSchema, type FormConfig } from "@/lib/forms/schema";
import { cn } from "@/lib/utils";
import {
  AfterSignupEditor,
  BuilderSection,
  ListsEditor,
  StatusEditor,
  StyleEditor,
  TextsEditor,
  isWebAddress,
} from "./builder-sections";
import { FieldsEditor, type AttributeChoice } from "./fields-editor";
import { useFormAutosave } from "./use-form-autosave";

export type BuilderForm = {
  id: string;
  name: string;
  publicId: string;
  status: "ACTIVE" | "PAUSED";
  config: FormConfig;
  listIds: string[];
};

/**
 * The form builder: settings on the left, a live preview on the right
 * (on phones: two tabs). Every change saves automatically. The share/embed
 * panel and the stats come from the page as ready-made pieces (`share`, `stats`).
 */
export function FormBuilder({
  form,
  brand,
  lists,
  attributes,
  doubleOptIn,
  canDelete,
  nameMax,
  share,
  stats,
}: {
  form: BuilderForm;
  brand: { name: string; logoUrl: string | null };
  lists: { id: string; name: string }[];
  attributes: AttributeChoice[];
  doubleOptIn: boolean;
  canDelete: boolean;
  nameMax: number;
  share?: ReactNode;
  stats?: ReactNode;
}) {
  const { state: saveState, save, flush } = useFormAutosave(form.id);
  const [name, setName] = useState(form.name);
  const [status, setStatus] = useState(form.status);
  const [config, setConfig] = useState<FormConfig>(form.config);
  const [listIds, setListIds] = useState<string[]>(form.listIds);
  /** Why the latest edit can't be saved yet (e.g. an empty label), or null. */
  const [problem, setProblem] = useState<string | null>(null);
  const [tab, setTab] = useState<"settings" | "preview">("settings");
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");

  /** Applies a change to the config; saves it if it's valid, otherwise shows what's wrong. */
  function changeConfig(patch: Partial<FormConfig>) {
    const next = { ...config, ...patch };
    setConfig(next);
    const issue = checkConfig(next, attributes);
    setProblem(issue);
    if (!issue) save({ config: formConfigSchema.parse(next) });
  }

  const attributeTypes = Object.fromEntries(attributes.map((a) => [a.key, a.type]));

  function showShare() {
    const el = document.getElementById("share");
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    // A short highlight so it's clear where we jumped to.
    el.classList.add("ring-3", "ring-emerald-500/40");
    setTimeout(() => el.classList.remove("ring-3", "ring-emerald-500/40"), 1600);
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 md:py-8 lg:px-8">
      <Header
        formId={form.id}
        publicId={form.publicId}
        name={name}
        nameMax={nameMax}
        status={status}
        canDelete={canDelete}
        flush={flush}
        onRename={(next) => {
          setName(next);
          save({ name: next }, 0);
        }}
        onShare={showShare}
        saveIndicator={
          problem ? (
            <span role="alert" className="inline-flex items-center gap-1.5 text-xs text-amber-700">
              <CircleAlert className="size-3.5" aria-hidden />
              Not saved yet: {problem}
            </span>
          ) : (
            <SaveIndicator state={saveState} onRetry={() => void flush()} />
          )
        }
      />

      {/* Phones: switch between the settings and the preview. */}
      <div className="grid grid-cols-2 rounded-lg bg-zinc-100 p-1 lg:hidden" role="group" aria-label="Show">
        {(["settings", "preview"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-emerald-500/40",
              tab === t ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-900",
            )}
          >
            {t === "settings" ? "Settings" : "Preview"}
          </button>
        ))}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        {/* ── Settings ── */}
        <div className={cn("flex min-w-0 flex-col gap-4", tab !== "settings" && "hidden lg:flex")}>
          <BuilderSection id="fields" icon={TextCursorInput} title="Fields" description="What people fill in. Each field fills in a contact field.">
            <FieldsEditor fields={config.fields} attributes={attributes} onChange={(fields) => changeConfig({ fields })} />
          </BuilderSection>

          <BuilderSection id="texts" icon={Type} title="Texts" description="The words on the form.">
            <TextsEditor config={config} onChange={changeConfig} />
          </BuilderSection>

          <BuilderSection id="after" icon={PartyPopper} title="After sign-up" description="What people see once they've signed up.">
            <AfterSignupEditor config={config} onChange={changeConfig} doubleOptIn={doubleOptIn} />
          </BuilderSection>

          <BuilderSection id="lists" icon={ListChecks} title="Lists" description="Which lists new subscribers join.">
            <ListsEditor
              lists={lists}
              value={listIds}
              onChange={(next) => {
                setListIds(next);
                save({ listIds: next }, 300);
              }}
            />
          </BuilderSection>

          <BuilderSection id="style" icon={Paintbrush} title="Style" description="Starts in your brand colours.">
            <StyleEditor style={config.style} hasLogo={!!brand.logoUrl} onChange={(style) => changeConfig({ style })} />
          </BuilderSection>

          <BuilderSection id="status" icon={Power} title="Status">
            <StatusEditor
              status={status}
              doubleOptIn={doubleOptIn}
              onChange={(next) => {
                setStatus(next);
                save({ status: next }, 0);
              }}
            />
          </BuilderSection>
        </div>

        {/* ── Live preview ── */}
        {/* Desktop: stays in view while the settings scroll (and scrolls itself if the form is tall). */}
        <div
          className={cn(
            "min-w-0 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto",
            tab !== "preview" && "hidden lg:block",
          )}
        >
          <div className="flex items-center justify-between gap-3 pb-3">
            <h2 className="text-sm font-semibold text-zinc-900">Preview</h2>
            <div className="flex rounded-lg bg-zinc-100 p-0.5" role="group" aria-label="Preview width">
              <DeviceButton active={device === "desktop"} onClick={() => setDevice("desktop")} icon={Monitor} label="Desktop" />
              <DeviceButton active={device === "phone"} onClick={() => setDevice("phone")} icon={Smartphone} label="Phone" />
            </div>
          </div>
          <div className="flex justify-center overflow-hidden rounded-xl border bg-zinc-100/80 p-4 sm:p-6">
            <div
              className={cn(
                "w-full transition-[max-width] duration-200",
                device === "phone" && "max-w-[375px] rounded-[1.75rem] border-[6px] border-zinc-800 bg-white px-3 py-6 shadow-lg",
              )}
            >
              <FormView config={config} brand={brand} attributeTypes={attributeTypes} disabled idPrefix="preview" />
            </div>
          </div>
          <p className="mt-2 text-center text-xs text-zinc-500">
            This is how visitors see it. The form can&apos;t be filled in here.
          </p>
        </div>
      </div>

      {/* Engineer C's panels bring their own headings. */}
      {stats && <div className="min-w-0">{stats}</div>}

      <div id="share" className="min-w-0 scroll-mt-6 rounded-xl transition-shadow">
        {share}
      </div>
    </div>
  );
}

/** The first reason this config can't be saved, or null when it's fine. */
function checkConfig(config: FormConfig, attributes: AttributeChoice[]): string | null {
  const parsed = formConfigSchema.safeParse(config);
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Something in the form isn't valid.";
  if (config.redirectUrl && !isWebAddress(config.redirectUrl)) return "The page after sign-up needs a full web address.";
  const known = new Set(attributes.map((a) => `attr:${a.key}`));
  const gone = config.fields.find((f) => f.target.startsWith("attr:") && !known.has(f.target));
  if (gone) return `Remove the deleted field “${gone.label}”.`;
  return null;
}

function DeviceButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Monitor;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-emerald-500/40",
        active ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-900",
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
    </button>
  );
}

// ── Header: name, status, links ─────────────────────────────────────────────

function Header({
  formId,
  publicId,
  name,
  nameMax,
  status,
  canDelete,
  flush,
  onRename,
  onShare,
  saveIndicator,
}: {
  formId: string;
  publicId: string;
  name: string;
  nameMax: number;
  status: "ACTIVE" | "PAUSED";
  canDelete: boolean;
  flush: () => Promise<boolean>;
  onRename: (name: string) => void;
  onShare: () => void;
  saveIndicator: ReactNode;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [duplicating, setDuplicating] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  function commit() {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== name) onRename(next);
    else setDraft(name);
  }

  async function duplicate() {
    setDuplicating(true);
    try {
      await flush(); // copy the latest version, not the last saved one
      const result = await duplicateFormAction(formId);
      if (!result.ok) return void toast.error(result.error);
      toast.success("Form duplicated. You're now editing the copy.");
      router.push(`/forms/${result.formId}`);
    } catch {
      toast.error("Couldn't reach the server. Please try again.");
    } finally {
      setDuplicating(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Link href="/forms" className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-900">
        <ArrowLeft className="size-4" aria-hidden />
        Forms
      </Link>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {editing ? (
            <input
              autoFocus
              value={draft}
              maxLength={nameMax}
              aria-label="Form name"
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") {
                  setDraft(name);
                  setEditing(false);
                }
              }}
              className="w-full max-w-xl rounded-md border border-emerald-500 bg-white px-2 py-1 text-2xl font-semibold tracking-tight text-zinc-900 ring-3 ring-emerald-500/20 outline-none"
            />
          ) : (
            <h1 className="min-w-0">
              <button
                type="button"
                onClick={() => {
                  setDraft(name);
                  setEditing(true);
                }}
                title="Rename"
                className="group inline-flex max-w-full items-center gap-2 rounded-md text-left text-2xl font-semibold tracking-tight text-zinc-900 outline-none focus-visible:ring-3 focus-visible:ring-emerald-500/40 sm:text-3xl"
              >
                <span className="min-w-0 break-words">{name}</span>
                <Pencil className="size-4 shrink-0 text-zinc-400 opacity-60 group-hover:opacity-100" aria-hidden />
                <span className="sr-only">(rename)</span>
              </button>
            </h1>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <FormStatusBadge status={status} />
            {saveIndicator}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/f/${publicId}`}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "outline" })}
            onClick={() => void flush()}
          >
            <ExternalLink aria-hidden />
            View live form
            <span className="sr-only">(opens in a new tab)</span>
          </a>
          <Button type="button" onClick={onShare}>
            <Share2 aria-hidden />
            Share &amp; embed
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label="More actions" disabled={duplicating} />}>
              {duplicating ? <Loader2 className="animate-spin" aria-hidden /> : <MoreHorizontal aria-hidden />}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={duplicate}>
                <Copy aria-hidden />
                Duplicate
              </DropdownMenuItem>
              {canDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                    <Trash2 aria-hidden />
                    Delete form
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <DeleteFormDialog
        formId={formId}
        name={name}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={() => router.push("/forms")}
      />
    </div>
  );
}
