import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

/** "← All segments" link shown above the rule builder. */
export function BackToSegments() {
  return (
    <Link
      href="/contacts/segments"
      className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-zinc-500 hover:text-emerald-700"
    >
      <ArrowLeftIcon className="size-4" />
      All segments
    </Link>
  );
}
