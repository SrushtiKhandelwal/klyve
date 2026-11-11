import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/** "← All providers", used on the add and edit pages. */
export function BackToProviders() {
  return (
    <Link
      href="/settings/providers"
      className="-mb-4 inline-flex w-fit items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-900"
    >
      <ArrowLeft className="size-4" aria-hidden />
      All providers
    </Link>
  );
}

/** Shown to MEMBERs, who may view and test providers but not change them. */
export function ManagersOnlyNotice({ action }: { action: string }) {
  return (
    <div className="rounded-xl border bg-white p-5 text-sm text-zinc-600">
      Only workspace owners and admins can {action}. You can still test providers and send test emails from the
      providers list.
    </div>
  );
}
