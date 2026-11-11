"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Shows {{ contact.KEY }} with a button that copies it, for pasting into emails. */
export function PersonalizationTag({ fieldKey }: { fieldKey: string }) {
  const tag = `{{ contact.${fieldKey} }}`;
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(tag);
      setCopied(true);
      toast.success(`Copied ${tag}`);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be blocked (e.g. on plain http on some browsers).
      toast.error("Couldn't copy automatically. Select the tag and copy it by hand.");
    }
  }

  return (
    <span className="inline-flex max-w-full items-center gap-1">
      <code className="truncate rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs text-zinc-700 select-all">
        {tag}
      </code>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={copy}
        aria-label={`Copy ${tag}`}
        title="Copy tag"
      >
        {copied ? <CheckIcon className="text-emerald-600" /> : <CopyIcon />}
      </Button>
    </span>
  );
}
