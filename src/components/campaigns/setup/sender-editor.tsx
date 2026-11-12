"use client";

import Link from "next/link";
import { CircleAlert, CircleCheck, CircleDashed, Mail } from "lucide-react";
import { cn } from "@/lib/utils";

export type SenderChoice = {
  id: string;
  email: string;
  name: string;
  /** The provider this sender sends through (its own, else the workspace default). */
  provider: { name: string; status: string } | null;
};

/** "Acme <news@acme.com>" */
export function senderText(s: { name: string; email: string }): string {
  return s.name ? `${s.name} <${s.email}>` : s.email;
}

/** Picks one VERIFIED sender. Unverified senders are never offered. */
export function SenderEditor({
  senders,
  value,
  onChange,
}: {
  senders: SenderChoice[];
  value: string | null;
  onChange: (senderId: string) => void;
}) {
  if (senders.length === 0) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-medium">You don&apos;t have a verified sender yet.</p>
        <p>
          A sender is the “From” address people see, like news@yourshop.com. Add one and confirm it with the code we email
          to it. It takes about a minute.
        </p>
        <Link href="/settings/senders" className="w-fit font-medium underline underline-offset-2">
          Add a sender in Settings
        </Link>
      </div>
    );
  }

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-sm font-medium text-zinc-900">Send from</legend>
      <div className="flex flex-col gap-2">
        {senders.map((s) => {
          const checked = value === s.id;
          return (
            <label
              key={s.id}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-emerald-500/40",
                checked ? "border-emerald-500 bg-emerald-50/50" : "hover:border-zinc-300",
              )}
            >
              <input
                type="radio"
                name="campaign-sender"
                value={s.id}
                checked={checked}
                onChange={() => onChange(s.id)}
                className="mt-1 size-4 shrink-0 accent-emerald-600"
              />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-sm font-medium break-all text-zinc-900">
                  {s.name} <span className="font-normal text-zinc-500">&lt;{s.email}&gt;</span>
                </span>
                <ProviderLine provider={s.provider} />
              </span>
            </label>
          );
        })}
      </div>
      <p className="text-xs text-zinc-500">
        Only verified senders are shown.{" "}
        <Link href="/settings/senders" className="font-medium text-emerald-700 hover:underline">
          Manage senders
        </Link>
      </p>
    </fieldset>
  );
}

/** "via Gmail · Connected", with a warning when the provider has a problem. */
export function ProviderLine({ provider }: { provider: SenderChoice["provider"] }) {
  if (!provider) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-red-700">
        <CircleAlert className="size-3.5" aria-hidden />
        No email provider connected.{" "}
        <Link href="/settings/providers" className="font-medium underline underline-offset-2">
          Connect one
        </Link>
      </span>
    );
  }
  const status =
    provider.status === "CONNECTED"
      ? { icon: CircleCheck, label: "Connected", className: "text-emerald-700" }
      : provider.status === "FAILED"
        ? { icon: CircleAlert, label: "Connection problem", className: "text-red-700" }
        : { icon: CircleDashed, label: "Not tested yet", className: "text-zinc-500" };
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-zinc-500">
      <Mail className="size-3.5" aria-hidden />
      via {provider.name}
      <span aria-hidden>·</span>
      <span className={cn("inline-flex items-center gap-1 font-medium", status.className)}>
        <status.icon className="size-3.5" aria-hidden />
        {status.label}
      </span>
    </span>
  );
}
