"use client";

// Preview and Code tabs. Both show the REAL email HTML made by the renderer
// (Server Action previewDocument), not the canvas approximation.
//
// SECURITY: the HTML is shown inside <iframe sandbox="">, which blocks
// scripts, forms and navigation, and keeps it away from the editor page.
// It is never put into the page with dangerouslySetInnerHTML.
import { useEffect, useRef, useState } from "react";
import { Check, Copy, Loader2, Monitor, Smartphone, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { previewDocument, type PreviewResult } from "@/app/actions/render";
import type { EmailDocument } from "@/lib/templates/document";
import { Segmented } from "./controls";

type Ok = Extract<PreviewResult, { ok: true }>;

/** Renders the document on the server, again whenever it changes (debounced). */
function useRenderedPreview(doc: EmailDocument, subject: string, preheader: string) {
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await previewDocument(doc, { subject, preheader, personalizeAs: "sample" });
        if (id === requestId.current) setResult(r);
      } catch {
        if (id === requestId.current) setResult({ ok: false, error: "The preview couldn't be loaded. Check your connection and try again." });
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [doc, subject, preheader]);

  return { result, loading };
}

function Status({ loading, result }: { loading: boolean; result: PreviewResult | null }) {
  if (result && !result.ok) {
    return (
      <div role="alert" className="mx-auto flex max-w-lg items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        {result.error}
      </div>
    );
  }
  if (!result) {
    return (
      <p className="flex items-center justify-center gap-2 py-10 text-sm text-zinc-500" role="status">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Building the preview…
      </p>
    );
  }
  return loading ? (
    <span className="sr-only" role="status">
      Updating preview
    </span>
  ) : null;
}

export function PreviewPane({ doc, subject, preheader }: { doc: EmailDocument; subject: string; preheader: string }) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const { result, loading } = useRenderedPreview(doc, subject, preheader);
  const ok: Ok | null = result?.ok ? result : null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-zinc-100">
      <div className="flex flex-wrap items-center gap-3 border-b bg-white px-3 py-2">
        <div className="w-56">
          <Segmented
            label="Preview size"
            value={device}
            onChange={setDevice}
            options={[
              { value: "desktop", label: "Desktop", icon: <><Monitor className="size-3.5" /> Desktop</> },
              { value: "mobile", label: "Phone", icon: <><Smartphone className="size-3.5" /> Phone</> },
            ]}
          />
        </div>
        <p className="text-xs text-zinc-500">Personalized with a sample contact. Links don&apos;t open in the preview.</p>
        {loading && <Loader2 className="ml-auto size-4 animate-spin text-zinc-400" aria-hidden />}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-6">
        <Status loading={loading} result={result} />
        {ok && (
          <div className={cn("mx-auto flex h-full min-h-[480px] flex-col overflow-hidden rounded-xl border bg-white shadow-sm", device === "mobile" ? "w-[375px] max-w-full" : "w-full max-w-[900px]")}>
            {/* Inbox-style header: what readers see before opening */}
            <div className="border-b px-4 py-3">
              <p className="truncate text-sm font-semibold text-zinc-900">{ok.subject || "(no subject)"}</p>
              <p className="truncate text-xs text-zinc-500">{preheader || "No preheader: email apps will show the first words of the email."}</p>
            </div>
            <iframe title="Email preview" sandbox="" srcDoc={ok.html} className="min-h-0 w-full flex-1 border-0 bg-white" />
          </div>
        )}
        {ok && ok.warnings.length > 0 && (
          <ul className="mx-auto mt-3 flex max-w-[900px] flex-col gap-1 text-xs text-amber-800">
            {ok.warnings.map((w) => (
              <li key={w} className="flex items-start gap-1.5">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {w}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Read-only HTML / plain text of the rendered email, with a copy button. */
export function CodePane({ doc, subject, preheader }: { doc: EmailDocument; subject: string; preheader: string }) {
  const [kind, setKind] = useState<"html" | "text">("html");
  const [copied, setCopied] = useState(false);
  const { result, loading } = useRenderedPreview(doc, subject, preheader);
  const ok: Ok | null = result?.ok ? result : null;
  const code = ok ? (kind === "html" ? ok.html : ok.text) : "";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b bg-white px-3 py-2">
        <div className="w-48">
          <Segmented
            label="Code type"
            value={kind}
            onChange={setKind}
            options={[
              { value: "html", label: "HTML" },
              { value: "text", label: "Plain text" },
            ]}
          />
        </div>
        <p className="hidden text-xs text-zinc-500 sm:block">Read-only. This is exactly what gets sent (with sample data filled in).</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="ml-auto"
          disabled={!ok}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              toast.error("Couldn't copy. Select the code and copy it by hand.");
            }
          }}
        >
          {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-zinc-950 p-3">
        {!ok ? (
          <div className="pt-6">
            <Status loading={loading} result={result} />
          </div>
        ) : (
          <pre className="font-mono text-xs leading-relaxed break-all whitespace-pre-wrap text-zinc-100" aria-label={kind === "html" ? "Email HTML" : "Plain text version"} tabIndex={0}>
            {code}
          </pre>
        )}
      </div>
    </div>
  );
}
