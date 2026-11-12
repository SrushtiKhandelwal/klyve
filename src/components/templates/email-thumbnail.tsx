"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { loadTemplateThumbnails } from "@/app/actions/templates";
import { cn } from "@/lib/utils";

// Small, scaled-down live previews of emails.
//
// The email is drawn at its real width (600px) inside an <iframe>, then
// shrunk with a CSS transform to fit the card. The iframe is SANDBOXED
// (no scripts, no access to our page or cookies) and ignores the mouse, so
// it's just a picture that happens to be real HTML.

const EMAIL_WIDTH = 600;

/** Watches an element's width so the preview can be scaled to fit it exactly. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * The scaled preview box. Pass `srcDoc` (HTML we already have) or `src`
 * (a URL the browser loads lazily). Shows a soft placeholder until ready.
 */
export function EmailThumbnail({
  srcDoc,
  src,
  title,
  className,
}: {
  srcDoc?: string | null;
  src?: string;
  title: string;
  className?: string;
}) {
  const [boxRef, width] = useWidth<HTMLDivElement>();
  const [loaded, setLoaded] = useState(false);
  const scale = width > 0 ? width / EMAIL_WIDTH : 0;
  const ready = !!src || !!srcDoc;

  return (
    <div
      ref={boxRef}
      className={cn("relative aspect-[4/5] w-full overflow-hidden bg-zinc-100", className)}
      aria-hidden="true"
    >
      {(!ready || !loaded) && (
        // A clear "still loading" state, so an unfinished card never looks broken.
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-zinc-100 text-zinc-400">
          <Loader2 className="size-6 animate-spin" />
          <span className="text-xs font-medium">Loading preview…</span>
        </div>
      )}
      {ready && scale > 0 && (
        <iframe
          title={title}
          src={src}
          srcDoc={srcDoc ?? undefined}
          // Empty sandbox = the strictest setting: no scripts, forms, popups or same-origin access.
          sandbox=""
          loading="lazy"
          tabIndex={-1}
          scrolling="no"
          onLoad={() => setLoaded(true)}
          className={cn(
            "pointer-events-none absolute top-0 left-0 origin-top-left border-0 bg-white transition-opacity duration-300",
            loaded ? "opacity-100" : "opacity-0",
          )}
          style={{
            width: EMAIL_WIDTH,
            // The box is 4:5, so 600 × 750 fills it exactly after scaling.
            height: EMAIL_WIDTH * 1.25,
            transform: `scale(${scale})`,
          }}
        />
      )}
    </div>
  );
}

// ── Lazy loading of saved templates' HTML ───────────────────────────────────
// Server Actions run one at a time, so asking for each card separately would
// load the previews one by one. Instead, cards that scroll into view within
// the same moment are collected and fetched together in ONE call.

const BATCH_DELAY_MS = 30;
const BATCH_MAX = 24;

/** html by "id:updatedAt", so an edited template gets a fresh preview. */
const htmlCache = new Map<string, string>();
const waiting = new Map<string, { id: string; callbacks: Set<(html: string) => void> }>();
let timer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  timer = null;
  const batch = [...waiting.entries()].slice(0, BATCH_MAX);
  for (const [key] of batch) waiting.delete(key);
  if (waiting.size > 0) timer = setTimeout(flush, BATCH_DELAY_MS);

  loadTemplateThumbnails(batch.map(([, w]) => w.id))
    .then((byId) => {
      for (const [key, w] of batch) {
        const html = byId[w.id] ?? "";
        htmlCache.set(key, html);
        w.callbacks.forEach((cb) => cb(html));
      }
    })
    .catch(() => {
      // Network hiccup: show an empty white preview rather than spinning forever.
      for (const [, w] of batch) w.callbacks.forEach((cb) => cb(""));
    });
}

function requestHtml(key: string, id: string, cb: (html: string) => void): () => void {
  const cached = htmlCache.get(key);
  if (cached !== undefined) {
    cb(cached);
    return () => {};
  }
  const entry = waiting.get(key) ?? { id, callbacks: new Set() };
  entry.callbacks.add(cb);
  waiting.set(key, entry);
  if (!timer) timer = setTimeout(flush, BATCH_DELAY_MS);
  return () => entry.callbacks.delete(cb);
}

/** Preview of a saved template, loaded only once its card is (nearly) on screen. */
export function SavedTemplateThumbnail({ id, version, title }: { id: string; version: string; title: string }) {
  const key = `${id}:${version}`;
  const ref = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<{ key: string; html: string } | null>(() => {
    const cached = htmlCache.get(key);
    return cached !== undefined ? { key, html: cached } : null;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancel = () => {};
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        cancel = requestHtml(key, id, (html) => setResult({ key, html }));
      },
      { rootMargin: "300px" },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancel();
    };
  }, [id, key]);

  // An empty design still gets a white page, so the placeholder goes away.
  const html = result && result.key === key ? result.html || "<!doctype html><html><body></body></html>" : null;
  return (
    <div ref={ref}>
      <EmailThumbnail srcDoc={html} title={title} />
    </div>
  );
}
