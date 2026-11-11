"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Pencil } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { PROVIDER_TYPES, PROVIDERS, type ProviderTypeValue } from "@/lib/email/provider-configs";
import { cn } from "@/lib/utils";
import { ProviderTypeIcon } from "./provider-bits";
import { blankInitial, ProviderForm, TestResultBanner, type ProviderSaved } from "./provider-form";

/**
 * Adding a provider in three steps:
 *   1. pick the type (SMTP, Amazon SES, Resend…),
 *   2. fill in the generated form,
 *   3. see whether the automatic connection test worked.
 */
export function NewProviderWizard({ showDevPresets }: { showDevPresets: boolean }) {
  const [type, setType] = useState<ProviderTypeValue | null>(null);
  const [saved, setSaved] = useState<ProviderSaved | null>(null);

  if (saved) return <SavedStep saved={saved} />;

  if (!type) {
    return (
      <section aria-labelledby="choose-type-heading" className="flex flex-col gap-4">
        <h2 id="choose-type-heading" className="font-semibold text-zinc-900">
          1. Choose your email service
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PROVIDER_TYPES.map((t) => {
            const def = PROVIDERS[t];
            return (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className="group flex flex-col gap-3 rounded-xl border bg-white p-5 text-left transition-colors hover:border-emerald-400 focus-visible:border-emerald-500 focus-visible:ring-3 focus-visible:ring-emerald-500/30 focus-visible:outline-none"
              >
                <div className="flex items-center justify-between gap-3">
                  <ProviderTypeIcon type={t} />
                  <ArrowRight
                    className="size-4 text-zinc-300 transition-colors group-hover:text-emerald-600"
                    aria-hidden
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-medium text-zinc-900">{def.label}</span>
                  <span className="text-sm text-zinc-500">{def.description}</span>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-semibold text-zinc-900">2. Connect {PROVIDERS[type].label}</h2>
      {/* key: switching type starts a fresh form. */}
      <ProviderForm
        key={type}
        type={type}
        initial={blankInitial(type)}
        showDevPresets={showDevPresets}
        onBack={() => setType(null)}
        onSaved={setSaved}
      />
    </section>
  );
}

function SavedStep({ saved }: { saved: ProviderSaved }) {
  return (
    <section className="flex flex-col gap-5 rounded-xl border bg-white p-5 sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-zinc-900">“{saved.name}” is saved</h2>
        <p className="text-sm text-zinc-500">
          {saved.test.ok
            ? "Everything looks good. Send yourself a test email from the providers list to be sure it arrives."
            : "Check the settings below, fix what's wrong and test again. You can also do that later."}
        </p>
      </div>
      <TestResultBanner result={saved.test} />
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        {!saved.test.ok && (
          <Link
            href={`/settings/providers/${saved.providerId}`}
            className={cn(buttonVariants({ variant: "outline", size: "lg" }), "px-4")}
          >
            <Pencil aria-hidden />
            Fix settings
          </Link>
        )}
        <Link
          href="/settings/providers"
          className={cn(buttonVariants({ size: "lg" }), "bg-emerald-600 px-4 text-white hover:bg-emerald-700")}
        >
          Go to providers
        </Link>
      </div>
    </section>
  );
}
