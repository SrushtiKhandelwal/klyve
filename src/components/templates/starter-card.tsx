"use client";

import { useState } from "react";
import { Eye, Loader2 } from "lucide-react";
import { EmailThumbnail } from "@/components/templates/email-thumbnail";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { StarterMeta } from "@/lib/templates/starters";

/** URL of a starter's preview in the workspace's brand (?v= changes when the brand does). */
export function starterPreviewUrl(id: string, version: string) {
  return `/templates/starters/${encodeURIComponent(id)}/preview?v=${encodeURIComponent(version)}`;
}

/** One starter in the gallery: brand-coloured preview, description and "Use this template". */
export function StarterCard({
  starter,
  previewVersion,
  onUse,
  busy,
  disabled,
}: {
  starter: StarterMeta;
  previewVersion: string;
  onUse: () => void;
  /** This card's "Use" is in progress. */
  busy: boolean;
  /** Another card's "Use" is in progress. */
  disabled: boolean;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const src = starterPreviewUrl(starter.id, previewVersion);

  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border bg-white transition-shadow hover:shadow-md">
      <button
        type="button"
        onClick={() => setPreviewOpen(true)}
        className="relative block border-b text-left outline-none focus-visible:ring-3 focus-visible:ring-emerald-500/40"
        aria-label={`Preview ${starter.name}`}
      >
        <EmailThumbnail src={src} title={`Preview of ${starter.name}`} />
        <span className="absolute inset-x-0 bottom-3 flex justify-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900/80 px-3 py-1 text-xs font-medium text-white">
            <Eye className="size-3.5" aria-hidden />
            Preview
          </span>
        </span>
      </button>
      <div className="flex flex-1 flex-col gap-3 p-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-emerald-700">{starter.category}</p>
          <h3 className="font-medium text-zinc-900">{starter.name}</h3>
          <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{starter.description}</p>
        </div>
        <Button className="mt-auto w-full" variant="outline" onClick={onUse} disabled={busy || disabled}>
          {busy && <Loader2 className="animate-spin" aria-hidden />}
          Use this template
        </Button>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{starter.name}</DialogTitle>
            <DialogDescription>{starter.description}</DialogDescription>
          </DialogHeader>
          {/* Full-size preview you can scroll. Still sandboxed: no scripts. */}
          <div className="min-h-0 flex-1 overflow-hidden rounded-lg border bg-zinc-100">
            <iframe
              title={`Full preview of ${starter.name}`}
              src={src}
              sandbox=""
              className="h-[60dvh] w-full border-0 bg-white"
            />
          </div>
          {starter.subject && (
            <p className="truncate text-xs text-zinc-500">
              <span className="font-medium text-zinc-700">Subject:</span> {starter.subject}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              Close
            </Button>
            <Button onClick={onUse} disabled={busy || disabled}>
              {busy && <Loader2 className="animate-spin" aria-hidden />}
              Use this template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}
