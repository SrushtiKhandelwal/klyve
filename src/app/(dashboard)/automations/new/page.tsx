import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Mail, Zap } from "lucide-react";
import { CreateAutomationForm } from "@/components/automations/create-automation-form";
import { RecipeGallery } from "@/components/automations/recipes/recipe-gallery";
import { PageContainer } from "@/components/dashboard/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { AUTOMATION_LIMITS } from "@/lib/automations/queries";
import { RECIPES } from "@/lib/automations/recipes/catalog";
import { db } from "@/lib/db";
import { requireActiveWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "New automation" };

type SearchParams = Promise<{ recipe?: string | string[] }>;

// /automations/new             → pick a recipe (or start from scratch)
// /automations/new?recipe=<id> → confirm and create it from that recipe
//
// Opening this page never creates anything: the "Create" button POSTs a form
// (a Server Action), so a link preview or a refresh can't make duplicates.
export default function NewAutomationPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <PageContainer>
      <Link href="/automations" className="-mb-4 inline-flex w-fit items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900">
        <ArrowLeft className="size-4" aria-hidden />
        All automations
      </Link>
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
        <NewContent searchParams={searchParams} />
      </Suspense>
    </PageContainer>
  );
}

async function NewContent({ searchParams }: { searchParams: SearchParams }) {
  const ws = await requireActiveWorkspace();
  const { recipe } = await searchParams;
  const recipeId = typeof recipe === "string" ? recipe : null;
  const meta = recipeId ? RECIPES.find((r) => r.id === recipeId) : null;
  const atLimit = (await db.automation.count({ where: { workspaceId: ws.id } })) >= AUTOMATION_LIMITS.maxPerWorkspace;

  if (meta) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium tracking-wide text-emerald-700 uppercase">{meta.category}</p>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">{meta.name}</h1>
          <p className="text-sm text-zinc-600 sm:text-base">{meta.description}</p>
        </div>
        <ul className="flex flex-col gap-2 text-sm text-zinc-700">
          <li className="flex items-center gap-2">
            <Zap className="size-4 text-zinc-400" aria-hidden />
            {meta.triggerLabel}
          </li>
          <li className="flex items-center gap-2">
            <Mail className="size-4 text-zinc-400" aria-hidden />
            {meta.emailCount} {meta.emailCount === 1 ? "email" : "emails"}, already designed in your brand
          </li>
        </ul>
        <p className="rounded-lg bg-zinc-50 px-3 py-2.5 text-sm text-zinc-600 ring-1 ring-zinc-200">{meta.setupNote}</p>
        <CreateAutomationForm recipeId={meta.id} defaultName={meta.name} disabled={atLimit} />
        {atLimit && <LimitNote />}
        <p className="text-xs text-zinc-500">It&apos;s created as a draft. Nothing is sent until you turn it on.</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">Create an automation</h1>
          <p className="text-sm text-zinc-500 sm:text-base">
            {recipeId ? "That recipe wasn't found. Pick one below, or start from scratch." : "Start from a ready-made recipe, or from scratch."}
          </p>
        </div>
        <CreateAutomationForm defaultName="" compact disabled={atLimit} />
      </div>
      {atLimit && <LimitNote />}
      <RecipeGallery />
    </>
  );
}

function LimitNote() {
  return (
    <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-600/15">
      You&apos;ve reached the limit of {AUTOMATION_LIMITS.maxPerWorkspace} automations. Delete one you no longer need first.
    </p>
  );
}
