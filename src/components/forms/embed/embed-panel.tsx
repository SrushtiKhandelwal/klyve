"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Code2, ExternalLink, FileCode2, Link2, Loader2, PauseCircle, RefreshCw, ShieldCheck, Store } from "lucide-react";
import { getFormEmbedData, type FormEmbedResult } from "@/app/actions/form-stats";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CodeBlock, CopyButton } from "@/components/forms/embed/code-block";
import { QrCodeCard } from "@/components/forms/embed/qr-code";
import { htmlFormSnippet, iframeSnippet } from "@/components/forms/embed/snippets";
import { cn } from "@/lib/utils";

// The "Share & embed" panel on a form's page: a link + QR code, an iframe
// code, a plain HTML code and how-tos for popular website builders.
//
// It loads the form's public URLs and last SAVED settings through a Server
// Action (scoped to the user's workspace), so the codes always match what
// visitors will actually see.

type Loaded = { token: string; result: FormEmbedResult };

export function EmbedPanel({ publicId, formName }: { publicId: string; formName: string }) {
  // Bumping `reload` re-fetches (after the form was saved, for example).
  const [reload, setReload] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const token = `${publicId}:${reload}`;

  useEffect(() => {
    let cancelled = false; // ignore an answer that arrives after we moved on
    getFormEmbedData(publicId).then(
      (result) => {
        if (!cancelled) setLoaded({ token, result });
      },
      () => {
        if (!cancelled) setLoaded({ token, result: { ok: false, message: "Couldn't load the codes. Check your connection and try again." } });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [publicId, token]);

  const loading = loaded?.token !== token;
  const result = loaded?.result;

  return (
    <section aria-labelledby="embed-title" className="flex flex-col gap-4 rounded-xl border bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="embed-title" className="font-semibold text-zinc-900">
            Share &amp; embed
          </h2>
          <p className="text-sm text-zinc-500">Put your form anywhere: share a link, print a QR code or add it to your website.</p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => setReload((n) => n + 1)} disabled={loading}>
          {loading ? <Loader2 aria-hidden className="animate-spin" /> : <RefreshCw aria-hidden />}
          Refresh codes
        </Button>
      </div>

      {!result ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading share and embed codes">
          <Skeleton className="h-8 w-full max-w-md" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : !result.ok ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {result.message}
        </p>
      ) : (
        <>
          {result.data.status === "PAUSED" && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <PauseCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
              This form is paused, so visitors will see &ldquo;not accepting sign-ups right now&rdquo;. Turn it back on to collect
              sign-ups. The codes below stay the same.
            </p>
          )}
          <PanelTabs publicId={publicId} formName={result.data.formName || formName} data={result.data} />
        </>
      )}

      <p className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
        <ShieldCheck aria-hidden className="mt-px size-4 shrink-0 text-emerald-700" />
        <span>
          Safe to share: these links and codes contain no passwords or secret keys, only your form&apos;s public address. Anyone can
          see them on your web page, and that&apos;s fine. Spam protection is built in.
        </span>
      </p>
    </section>
  );
}

function PanelTabs({
  publicId,
  formName,
  data,
}: {
  publicId: string;
  formName: string;
  data: Extract<FormEmbedResult, { ok: true }>["data"];
}) {
  const { urls, config } = data;
  const title = config?.title || formName;

  return (
    <Tabs defaultValue="link" className="gap-4">
      <TabsList className="max-w-full justify-start overflow-x-auto">
        <TabsTrigger value="link" className="px-3">
          <Link2 aria-hidden />
          Share link
        </TabsTrigger>
        <TabsTrigger value="iframe" className="px-3">
          <Code2 aria-hidden />
          Website embed
        </TabsTrigger>
        <TabsTrigger value="html" className="px-3">
          <FileCode2 aria-hidden />
          HTML form
        </TabsTrigger>
        <TabsTrigger value="guides" className="px-3">
          <Store aria-hidden />
          WordPress &amp; more
        </TabsTrigger>
      </TabsList>

      {/* ── Share link + QR ─────────────────────────────────────────── */}
      <TabsContent value="link" className="flex flex-col gap-5">
        <Intro>
          Your form has its own page. Send the link in a message, post it on social media or put it in your bio. No website
          needed.
        </Intro>
        <div className="flex flex-col gap-2">
          <label htmlFor="form-share-url" className="text-sm font-medium text-zinc-900">
            Form link
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="form-share-url"
              readOnly
              value={urls.hostedUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="h-8 min-w-0 flex-1 rounded-lg border bg-zinc-50 px-2.5 font-mono text-xs text-zinc-800 outline-none focus-visible:ring-3 focus-visible:ring-emerald-500/40"
            />
            <div className="flex gap-2">
              <CopyButton text={urls.hostedUrl} what="Link" label="Copy link" />
              <a
                href={urls.hostedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ variant: "outline" }), "shrink-0")}
              >
                <ExternalLink aria-hidden />
                Open
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-zinc-900">QR code</h3>
          <QrCodeCard url={urls.hostedUrl} formName={formName} />
        </div>
      </TabsContent>

      {/* ── iframe ──────────────────────────────────────────────────── */}
      <TabsContent value="iframe" className="flex flex-col gap-4">
        <Intro>
          The easiest way to add the form to a website. Paste this code where you want the form to appear. It brings its own
          look (your colours and fonts), and any change you save here shows up on your site automatically.
        </Intro>
        <CodeBlock code={iframeSnippet(urls, title)} label="Embed code" what="Embed code" rows={4} />
        <Hint>
          If the bottom of the form is cut off, make the number in <Code>height=&quot;520&quot;</Code> bigger (for example 640).
        </Hint>
      </TabsContent>

      {/* ── Plain HTML form ─────────────────────────────────────────── */}
      <TabsContent value="html" className="flex flex-col gap-4">
        <Intro>
          A plain HTML form with no frame and no scripts. It works on any website, including WordPress, Wix, Squarespace and
          Shopify &ldquo;Custom HTML&rdquo; blocks, and you (or your web designer) can restyle it freely.
        </Intro>
        {config ? (
          <>
            <CodeBlock
              code={htmlFormSnippet(config, urls, { publicId, formName, attributeTypes: data.attributeTypes })}
              label="HTML code"
              what="HTML code"
              rows={10}
            />
            <Hint>
              This is a copy of your form as it is now. If you add or rename fields later, copy the code again. (The website
              embed above updates by itself.) Don&apos;t remove the hidden <Code>website_url</Code> field: it catches spam bots.
            </Hint>
            <details className="text-sm">
              <summary className="w-fit cursor-pointer text-xs font-medium text-zinc-500 hover:text-zinc-800">Preview</summary>
              {/* sandbox="" = the preview can't run scripts or submit, it's just a picture. */}
              <iframe
                title={`Preview of the HTML code for ${formName}`}
                sandbox=""
                srcDoc={`<!doctype html><meta charset="utf-8"><body style="margin:16px;background:#f4f4f5">${htmlFormSnippet(config, urls, { publicId, formName, attributeTypes: data.attributeTypes })}</body>`}
                className="mt-2 h-[560px] w-full rounded-lg border bg-zinc-100"
              />
            </details>
          </>
        ) : (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            The form&apos;s settings couldn&apos;t be read. Open the form editor, save it again, then click &ldquo;Refresh
            codes&rdquo;.
          </p>
        )}
      </TabsContent>

      {/* ── How-tos ─────────────────────────────────────────────────── */}
      <TabsContent value="guides" className="flex flex-col gap-4">
        <Intro>Copy the Website embed code (or the HTML code), then paste it in your site builder:</Intro>
        <div className="grid gap-3 sm:grid-cols-2">
          <Guide title="WordPress">
            <li>Edit the page or post where the form should go.</li>
            <li>
              Click <b>+</b>, search for <b>Custom HTML</b> and add that block.
            </li>
            <li>Paste the code and click Update.</li>
            <li>Using Elementor? Drag in the <b>HTML</b> widget instead.</li>
          </Guide>
          <Guide title="Shopify">
            <li>
              Go to <b>Online Store → Themes → Customize</b>.
            </li>
            <li>
              Click <b>Add section</b> (or Add block) and choose <b>Custom Liquid</b>.
            </li>
            <li>Paste the code and click Save.</li>
          </Guide>
          <Guide title="Wix">
            <li>
              Click <b>Add (+) → Embed code → Embed HTML</b>.
            </li>
            <li>
              Choose <b>Code</b>, paste the code and click Update.
            </li>
            <li>Drag the box to size. Make it tall enough for the whole form.</li>
          </Guide>
          <Guide title="Squarespace & others">
            <li>
              Add a <b>Code</b> (or &ldquo;Embed&rdquo;, &ldquo;HTML&rdquo;) block.
            </li>
            <li>Paste the code and save.</li>
            <li>No such block? Use the Share link instead: it works everywhere.</li>
          </Guide>
        </div>
        <Hint>Tip: after publishing, open your page and sign up once yourself to check it works. You&apos;ll see it in Statistics.</Hint>
      </TabsContent>
    </Tabs>
  );
}

function Intro({ children }: { children: ReactNode }) {
  return <p className="text-sm text-zinc-600">{children}</p>;
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="text-xs text-zinc-500">{children}</p>;
}

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[11px] text-zinc-800">{children}</code>;
}

function Guide({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border p-3">
      <h3 className="mb-1.5 text-sm font-medium text-zinc-900">{title}</h3>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-600">{children}</ol>
    </div>
  );
}
