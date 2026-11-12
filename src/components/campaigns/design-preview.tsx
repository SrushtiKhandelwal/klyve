"use client";

import { useEffect, useState } from "react";
import { Eye, Loader2, TriangleAlert } from "lucide-react";
import { previewDocument } from "@/app/actions/render";
import { EmailThumbnail } from "@/components/templates/email-thumbnail";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { EmailDocument } from "@/lib/templates/document";

// Previews of a campaign's own design, filled in with sample details by the
// same renderer the real send uses (the previewDocument Server Action).
// Shown in SANDBOXED iframes: no scripts, no access to our page or cookies.

type PreviewState = { kind: "loading" } | { kind: "ready"; html: string } | { kind: "error"; message: string };

/** Renders the design once (and again if it changes). */
export function useDesignHtml(document: EmailDocument | null, subject: string, preheader: string): PreviewState {
  const key = JSON.stringify([document, subject, preheader]);
  const [state, setState] = useState<{ key: string; value: PreviewState } | null>(null);

  useEffect(() => {
    if (!document) return;
    let cancelled = false;
    previewDocument(document, { subject, preheader })
      .then((result) => {
        if (cancelled) return;
        setState({ key, value: result.ok ? { kind: "ready", html: result.html } : { kind: "error", message: result.error } });
      })
      .catch(() => {
        if (!cancelled) setState({ key, value: { kind: "error", message: "Couldn't load the preview." } });
      });
    return () => {
      cancelled = true;
    };
    // `key` covers document/subject/preheader, so a new object with the same content doesn't re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!document) return { kind: "error", message: "This campaign has no design yet." };
  return state && state.key === key ? state.value : { kind: "loading" };
}

/** Small scaled-down picture of the email (same look as the template cards). */
export function DesignThumbnail({ state, title }: { state: PreviewState; title: string }) {
  if (state.kind === "error") {
    return (
      <div className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-2 bg-zinc-100 p-3 text-center text-xs text-zinc-500">
        <TriangleAlert className="size-5 text-amber-500" aria-hidden />
        {state.message}
      </div>
    );
  }
  return <EmailThumbnail srcDoc={state.kind === "ready" ? state.html || "<!doctype html><html><body></body></html>" : null} title={title} />;
}

/** "Preview" button that opens the full email in a dialog you can scroll. */
export function FullPreviewButton({
  state,
  title,
  description,
  variant = "outline",
}: {
  state: PreviewState;
  title: string;
  description?: string;
  variant?: "outline" | "ghost";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant={variant} onClick={() => setOpen(true)} disabled={state.kind === "error"}>
        <Eye aria-hidden />
        Preview
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <DesignFrame state={state} title={title} className="h-[65dvh]" />
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Read-only look at what was sent (status page): small picture + full preview button. */
export function SentDesignPreview({
  document,
  subject,
  preheader,
}: {
  document: EmailDocument | null;
  subject: string;
  preheader: string;
}) {
  const state = useDesignHtml(document, subject, preheader);
  return (
    <div className="flex flex-col gap-3">
      <div className="w-full max-w-48 overflow-hidden rounded-lg border">
        <DesignThumbnail state={state} title={`Preview of ${subject || "the email"}`} />
      </div>
      <FullPreviewButton state={state} title={subject || "Email preview"} description="With sample details filled in, so it shows how a typical subscriber sees it." />
    </div>
  );
}

/** The full email at real size, scrollable. */
export function DesignFrame({ state, title, className }: { state: PreviewState; title: string; className?: string }) {
  return (
    <div className={`relative min-h-0 flex-1 overflow-hidden rounded-lg border bg-zinc-100 ${className ?? ""}`}>
      {state.kind === "ready" ? (
        <iframe title={title} srcDoc={state.html} sandbox="" className="size-full border-0 bg-white" />
      ) : state.kind === "loading" ? (
        <div className="flex size-full items-center justify-center gap-2 text-sm text-zinc-500">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Loading preview…
        </div>
      ) : (
        <div className="flex size-full items-center justify-center p-6 text-center text-sm text-zinc-500">{state.message}</div>
      )}
    </div>
  );
}
