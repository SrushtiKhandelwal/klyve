"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Cake, CalendarDays, ClipboardList, HeartHandshake, Mail, PartyPopper, Zap } from "lucide-react";
import { Glyph } from "@/components/brand/glyph";
import { RECIPE_CATEGORIES, RECIPES, type RecipeCategory } from "@/lib/automations/recipes/catalog";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// The ready-made automations, as cards. "Use recipe" opens the builder's
// "new automation" page with ?recipe=<id>, which creates a DRAFT from it in
// the workspace's brand. Nothing is sent until the user turns it on.
//
// A client component only for the category filter chips; it imports the
// small catalog (words only), not the email designs.

const CATEGORY_ICONS: Record<RecipeCategory, typeof Mail> = {
  "Welcome & onboarding": PartyPopper,
  Forms: ClipboardList,
  Birthdays: Cake,
  "Re-engagement": HeartHandshake,
  Events: CalendarDays,
};

export function RecipeGallery() {
  const [category, setCategory] = useState<RecipeCategory | "all">("all");
  const shown = category === "all" ? RECIPES : RECIPES.filter((r) => r.category === category);

  return (
    <div className="flex flex-col gap-4">
      {/* Category filter: plain toggle buttons, so it works with the keyboard. */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Filter by category">
        {(["all", ...RECIPE_CATEGORIES] as const).map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={category === c}
            onClick={() => setCategory(c)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              category === c ? "border-emerald-600 bg-emerald-600 text-white" : "bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900",
            )}
          >
            {c === "all" ? "All" : c}
          </button>
        ))}
      </div>

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((r) => {
          const Icon = CATEGORY_ICONS[r.category] ?? Zap;
          return (
            <li key={r.id} className="flex min-w-0 flex-col gap-3 rounded-xl border bg-white p-4 sm:p-5">
              <div className="flex items-center gap-2">
                <Glyph icon={Icon} size="sm" />
                <span className="text-xs font-medium text-emerald-700">{r.category}</span>
              </div>
              <div className="flex flex-1 flex-col gap-1">
                <h3 className="font-semibold text-zinc-900">{r.name}</h3>
                <p className="text-sm text-zinc-600">{r.description}</p>
              </div>
              <dl className="flex flex-col gap-1.5 text-xs">
                <div className="flex items-start gap-1.5">
                  <dt className="sr-only">Starts</dt>
                  <Zap aria-hidden className="mt-0.5 size-3.5 shrink-0 text-zinc-400" />
                  <dd className="text-zinc-700">{r.triggerLabel}</dd>
                </div>
                <div className="flex items-start gap-1.5">
                  <dt className="sr-only">Emails</dt>
                  <Mail aria-hidden className="mt-0.5 size-3.5 shrink-0 text-zinc-400" />
                  <dd className="text-zinc-700">
                    {r.emailCount} {r.emailCount === 1 ? "email" : "emails"}
                  </dd>
                </div>
              </dl>
              <p className="rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-500">{r.setupNote}</p>
              <Link
                href={`/automations/new?recipe=${encodeURIComponent(r.id)}`}
                className={cn(buttonVariants({ variant: "default" }), "w-full")}
                aria-label={`Use recipe: ${r.name}`}
              >
                Use recipe
                <ArrowRight aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
