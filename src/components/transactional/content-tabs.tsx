"use client";

import { ArchiveXIcon } from "lucide-react";
import { CodeBlock } from "@/components/transactional/code";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// The three views of one email on its detail page: what it looks like (HTML),
// its plain-text version, and the JSON object the API returns for it.

export function ContentTabs({
  html,
  text,
  json,
  clearedNote,
}: {
  html: string | null;
  text: string | null;
  /** The API's JSON for this email, already pretty-printed. */
  json: string;
  /** Why there's no content (cleared after 30 days, or never kept). null when there is content. */
  clearedNote: string | null;
}) {
  return (
    <Tabs defaultValue={html ? "html" : text ? "text" : "json"}>
      <TabsList>
        <TabsTrigger value="html">Preview</TabsTrigger>
        <TabsTrigger value="text">Text</TabsTrigger>
        <TabsTrigger value="json">JSON</TabsTrigger>
      </TabsList>

      <TabsContent value="html" className="mt-2">
        {html ? (
          <div className="overflow-hidden rounded-xl border bg-white">
            {/* sandbox="": the email can't run scripts, submit forms or navigate this page. It's just a picture. */}
            <iframe title="Email preview" sandbox="" srcDoc={html} className="h-[32rem] w-full border-0 bg-white sm:h-[40rem]" />
          </div>
        ) : (
          <NoContent note={clearedNote} what="HTML" />
        )}
      </TabsContent>

      <TabsContent value="text" className="mt-2">
        {text ? (
          <pre className="max-h-[40rem] overflow-auto rounded-xl border bg-zinc-50 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap text-zinc-800">
            {text}
          </pre>
        ) : (
          <NoContent note={clearedNote} what="plain-text" />
        )}
      </TabsContent>

      <TabsContent value="json" className="mt-2 flex flex-col gap-2">
        <p className="text-xs text-zinc-500">
          Exactly what <code className="font-mono">GET /api/v1/emails/{"{id}"}</code> returns for this email.
        </p>
        <CodeBlock code={json} title="Response" what="JSON" />
      </TabsContent>
    </Tabs>
  );
}

function NoContent({ note, what }: { note: string | null; what: string }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed bg-white px-6 py-12 text-center">
      <ArchiveXIcon className="size-8 text-zinc-400" aria-hidden />
      <p className="mt-3 max-w-md text-sm text-zinc-600">{note ?? `This email has no ${what} version.`}</p>
    </div>
  );
}
