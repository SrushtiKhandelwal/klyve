"use client";

import { useId, useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Copies text to the clipboard, with a short "Copied" state on the button. */
export function CopyButton({ text, label = "Copy", what }: { text: string; label?: string; what: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true);
        toast.success(`${what} copied.`);
        // Switch the icon back after a moment so it can be copied again.
        setTimeout(() => setCopied(false), 2000);
      },
      () => toast.error("Couldn't copy. Select the text and copy it instead."),
    );
  }

  return (
    <Button type="button" variant="outline" onClick={copy} className="shrink-0">
      {copied ? <Check aria-hidden className="text-emerald-600" /> : <Copy aria-hidden />}
      {copied ? "Copied" : label}
    </Button>
  );
}

/**
 * A read-only box of code with a Copy button. A <textarea> (not <pre>) so a
 * click selects everything, which also makes manual copying easy on phones.
 */
export function CodeBlock({ code, label, what, rows = 6 }: { code: string; label: string; what: string; rows?: number }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-zinc-900">
          {label}
        </label>
        <CopyButton text={code} what={what} label="Copy code" />
      </div>
      <textarea
        id={id}
        readOnly
        value={code}
        rows={rows}
        spellCheck={false}
        onFocus={(e) => e.currentTarget.select()}
        className="w-full resize-y rounded-lg border bg-zinc-50 px-3 py-2 font-mono text-xs leading-relaxed text-zinc-800 outline-none focus-visible:ring-3 focus-visible:ring-emerald-500/40"
      />
    </div>
  );
}
