"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { BASE_URL_TOKEN, SNIPPET_LANGS, withBaseUrl, type SnippetLang } from "@/components/transactional/snippets";
import { cn } from "@/lib/utils";

// Dark code boxes with a Copy button, and a tabbed group (cURL / Node.js /
// Python / PHP). Used by the API docs and the API keys page.

// ── The real address of this Klyve ───────────────────────────────────────────

const noopSubscribe = () => () => {};

/**
 * The browser's origin (e.g. "https://mail.acme.com"), or null on the server
 * and during hydration. The docs are a static page built before the domain is
 * known, so the server shows a placeholder and the browser fills in the truth.
 */
export function useOrigin(): string | null {
  return useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => null,
  );
}

// ── Remembered language choice (shared by every code group on the page) ─────

const LANG_KEY = "klyve-docs-lang";
const listeners = new Set<() => void>();
let memoryLang: SnippetLang | null = null;

function readLang(): SnippetLang {
  if (memoryLang) return memoryLang;
  try {
    // Storage can throw (private mode, blocked cookies): then just use cURL.
    const saved = window.localStorage.getItem(LANG_KEY);
    if (SNIPPET_LANGS.some((l) => l.id === saved)) return saved as SnippetLang;
  } catch {}
  return "curl";
}

function setLang(lang: SnippetLang) {
  memoryLang = lang;
  try {
    window.localStorage.setItem(LANG_KEY, lang);
  } catch {}
  listeners.forEach((fn) => fn());
}

function subscribeLang(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function useLang(): SnippetLang {
  return useSyncExternalStore(subscribeLang, readLang, () => "curl");
}

// ── Copy button ──────────────────────────────────────────────────────────────

export function CopyIconButton({ text, what = "Code", className }: { text: string; what?: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true);
        toast.success(`${what} copied.`);
        // Back to the copy icon after a moment, so it can be copied again.
        setTimeout(() => setCopied(false), 2000);
      },
      () => toast.error("Couldn't copy. Select the text and copy it instead."),
    );
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-zinc-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none",
        className,
      )}
    >
      {copied ? <Check className="size-3.5 text-emerald-400" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      {copied ? "Copied" : "Copy"}
      <span className="sr-only"> {what.toLowerCase()}</span>
    </button>
  );
}

// ── Code boxes ───────────────────────────────────────────────────────────────

function CodeFrame({ header, code, what }: { header: ReactNode; code: string; what: string }) {
  return (
    <div className="overflow-hidden rounded-xl bg-zinc-950 ring-1 ring-zinc-900/10">
      <div className="flex min-h-10 items-center justify-between gap-2 border-b border-white/10 px-3">
        <div className="min-w-0">{header}</div>
        <CopyIconButton text={code} what={what} />
      </div>
      {/* tabIndex: lets keyboard users scroll wide code sideways. */}
      <pre tabIndex={0} className="overflow-x-auto p-4 text-[13px] leading-relaxed text-zinc-100 focus-visible:outline-none">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  );
}

/**
 * One block of code. `code` may contain BASE_URL_TOKEN; it's replaced by this
 * site's address in the browser.
 */
export function CodeBlock({ code, title, what = "Code" }: { code: string; title?: string; what?: string }) {
  const origin = useOrigin();
  const text = withBaseUrl(code, origin);
  return (
    <CodeFrame header={<span className="truncate text-xs font-medium text-zinc-400">{title}</span>} code={text} what={what} />
  );
}

/** The same example in several languages, with tabs. Every group on the page switches together. */
export function CodeTabs({ snippets, what = "Code" }: { snippets: Record<SnippetLang, string>; what?: string }) {
  const origin = useOrigin();
  const lang = useLang();
  const text = withBaseUrl(snippets[lang], origin);

  return (
    <CodeFrame
      code={text}
      what={what}
      header={
        <div role="tablist" aria-label="Language" className="-mb-px flex overflow-x-auto">
          {SNIPPET_LANGS.map((l) => (
            <button
              key={l.id}
              type="button"
              role="tab"
              aria-selected={lang === l.id}
              onClick={() => setLang(l.id)}
              className={cn(
                "border-b-2 px-2.5 py-2.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:text-white focus-visible:outline-none",
                lang === l.id ? "border-emerald-400 text-white" : "border-transparent text-zinc-400 hover:text-zinc-200",
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
      }
    />
  );
}

/** The site's address as text (placeholder until the browser knows it). */
export function BaseUrl({ path = "" }: { path?: string }) {
  const origin = useOrigin();
  return <>{withBaseUrl(`${BASE_URL_TOKEN}${path}`, origin)}</>;
}
