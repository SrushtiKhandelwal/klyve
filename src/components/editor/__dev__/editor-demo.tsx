"use client";

// DEVELOPMENT ONLY: the editor with a sample document and a fake save, for
// trying it out without a real template. Not linked from anywhere.
//
// To use it, render <EditorDemo /> from a temporary page, e.g.
//   export default function Page() { return <EditorDemo />; }
import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { EmailEditor } from "@/components/editor/email-editor";
import {
  BUILTIN_MERGE_TAGS,
  createBlock,
  createSection,
  DEFAULT_THEME,
  emptyDocument,
  type EmailDocument,
} from "@/lib/templates/document";

/** A document that uses every block type, for testing. */
export function demoDocument(): EmailDocument {
  const theme = DEFAULT_THEME;
  const base = emptyDocument(theme);
  const button = createBlock("button", theme);
  const social = createBlock("social", theme);
  return {
    ...base,
    sections: [
      base.sections[0],
      createSection([50, 50], [[createBlock("image", theme), createBlock("text", theme)], [button, createBlock("divider", theme)]]),
      createSection([100], [[createBlock("spacer", theme), createBlock("video", theme), createBlock("html", theme)]]),
      createSection([100], [[social.type === "social" ? { ...social, links: [{ network: "instagram", url: "https://instagram.com/" }, { network: "website", url: "https://example.com" }] } : social]]),
      base.sections[1],
    ],
  };
}

const DEMO_TAGS = [...BUILTIN_MERGE_TAGS, { tag: "{{ contact.CITY }}", label: "City", example: "Pune" }];

export function EditorDemo({ failSaves = false }: { failSaves?: boolean }) {
  const [saves, setSaves] = useState(0);
  const [initial] = useState(demoDocument);
  return (
    <EmailEditor
      initialDocument={initial}
      theme={DEFAULT_THEME}
      mergeTags={DEMO_TAGS}
      subject={'Hello {{ contact.FIRSTNAME | default: "there" }}'}
      preheader="A quick update from us"
      onSave={async (input) => {
        // Pretend to talk to the server.
        await new Promise((r) => setTimeout(r, 600));
        if (failSaves) return { ok: false, error: "Demo: saving is switched off." };
        setSaves((n) => n + 1);
        console.info("[editor demo] saved", input);
        return { ok: true };
      }}
      onSendTest={() => toast.info("Demo: the page would open its send-test dialog here.")}
      headerSlot={
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-700">
          <FlaskConical className="size-4 text-amber-600" aria-hidden /> Editor demo
          <span className="text-xs font-normal text-zinc-400">({saves} saves)</span>
        </span>
      }
    />
  );
}
