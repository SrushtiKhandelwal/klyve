"use client";

// "Improve with AI" for heading, text and button blocks (in the right panel).
//
// The new text goes in through the editor's normal `updateBlock` edit, so
// Undo (Ctrl+Z) brings the old text back. The server keeps merge tags such as
// {{ contact.FIRSTNAME }} and links exactly as they were, and cleans the HTML.
import { useState, useTransition } from "react";
import { ChevronDown, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { improveTextAction } from "@/app/actions/ai";
import { AiErrorText, AiNotSetUp, OFFLINE_MESSAGE } from "@/components/ai/ai-bits";
import { useAiConfigured } from "@/components/ai/use-ai-status";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IMPROVE_ACTIONS, type ImproveAction } from "@/lib/ai/inputs";
import type { Block } from "@/lib/templates/document";
import { findBlock } from "@/lib/templates/editor-state";
import { PanelSection } from "./controls";
import { useEditorApi } from "./editor-store";

type ImprovableBlock = Extract<Block, { type: "heading" | "text" | "button" }>;

export function isImprovable(block: Block): block is ImprovableBlock {
  return block.type === "heading" || block.type === "text" || block.type === "button";
}

const contentOf = (block: ImprovableBlock) => (block.type === "button" ? block.label : block.html);

const REWRITE = IMPROVE_ACTIONS.filter((a) => !a.value.startsWith("to_"));
const TRANSLATE = IMPROVE_ACTIONS.filter((a) => a.value.startsWith("to_"));

export function AiImproveMenu({ block }: { block: ImprovableBlock }) {
  const api = useEditorApi();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const configured = useAiConfigured();

  function run(action: ImproveAction, label: string) {
    setError(null);
    const original = contentOf(block);
    startTransition(async () => {
      try {
        const result = await improveTextAction({ blockType: block.type, action, content: original });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        // The block may have been edited or deleted while the AI was busy:
        // then we don't overwrite the newer text.
        const current = findBlock(api.getDocument(), block.id)?.block;
        if (!current || !isImprovable(current) || contentOf(current) !== original) {
          setError("The text changed while the AI was working, so we left it as it is. Try again.");
          return;
        }
        api.dispatch({
          type: "updateBlock",
          blockId: block.id,
          patch: block.type === "button" ? { label: result.content } : { html: result.content },
        });
        toast.success(`${label}: done. Press Ctrl+Z to undo.`);
      } catch {
        setError(OFFLINE_MESSAGE);
      }
    });
  }

  return (
    <PanelSection title="AI">
      {configured === false ? (
        <AiNotSetUp />
      ) : (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button type="button" size="sm" variant="outline" className="self-start" disabled={pending} />}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles className="text-emerald-600" aria-hidden />}
              {pending ? "Improving…" : "Improve with AI"}
              {!pending && <ChevronDown aria-hidden />}
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Rewrite</DropdownMenuLabel>
                {REWRITE.map((a) => (
                  <DropdownMenuItem key={a.value} onClick={() => run(a.value, a.label)}>
                    {a.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel>Translate</DropdownMenuLabel>
                {TRANSLATE.map((a) => (
                  <DropdownMenuItem key={a.value} onClick={() => run(a.value, a.label)}>
                    {a.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <AiErrorText message={error} />
          <p className="text-xs text-zinc-500">Personalization tags and links stay exactly as they are.</p>
        </>
      )}
    </PanelSection>
  );
}
