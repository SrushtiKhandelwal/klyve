import "server-only";
import { z } from "zod";
import { AiError } from "@/lib/ai/errors";
import type { ImprovableBlock, ImproveAction } from "@/lib/ai/inputs";
import { cleanLine, compareMergeTags, linksAreUnchanged, protectMergeTags } from "@/lib/ai/safety";
import { sanitizeRichText } from "@/lib/templates/sanitize";

// "Improve with AI" in the email editor: rewrite one heading, text or button.
//
// Protections, in order:
//  1. Merge tags are swapped for [[T1]]-style placeholders before the AI sees
//     the text, and the exact originals are put back afterwards. If one is
//     missing (or the AI made up a new one) the answer is refused.
//  2. Rich text goes through the project's sanitizer (only the editor's small
//     set of tags survives).
//  3. Links: the AI may keep the links that were there, never add or change one.
//  4. A final check that the merge tags are exactly the original ones.

const ACTION_INSTRUCTIONS: Record<ImproveAction, string> = {
  shorter: "Make it shorter and tighter (about half the length) while keeping the meaning and the language.",
  friendlier: "Make it warmer and friendlier, keeping the meaning and the language.",
  professional: "Make it more professional and polished, keeping the meaning and the language.",
  fix: "Fix spelling, grammar and punctuation only. Change as little as possible and keep the language.",
  to_hi: "Translate it into Hindi (Devanagari script). Keep brand and product names as they are.",
  to_mr: "Translate it into Marathi (Devanagari script). Keep brand and product names as they are.",
  to_en: "Translate it into English. Keep brand and product names as they are.",
};

export const improveAnswerSchema = z.object({ text: z.string().max(40_000) });

export function improvePrompt(input: { blockType: ImprovableBlock; action: ImproveAction; protectedContent: string }) {
  const isButton = input.blockType === "button";
  const system = [
    "You edit short pieces of marketing email copy. You answer with ONE JSON object and nothing else.",
    'JSON shape: {"text": string}',
    `Task: ${ACTION_INSTRUCTIONS[input.action]}`,
    "Rules:",
    "- Placeholders like [[T1]], [[T2]] stand for personalization. Keep every one of them exactly as written (same brackets, same number), in a sensible place. Never add new ones, never translate them.",
    "- Never use curly braces.",
    isButton
      ? "- This is a button label: plain text, one short line (max 6 words), no HTML."
      : input.blockType === "heading"
        ? "- This is a heading in HTML. Keep it one line. You may keep <strong>, <em>, <u>, <s>, <span style> and <a href> tags that are already there; add no new tags."
        : "- This is HTML. Keep the same structure: <p>, <br>, <ul>, <ol>, <li>, <strong>, <em>, <u>, <s>, <span style> and <a href> tags. Do not add any other tags.",
    "- Never add, remove or change link addresses (href). Never add new links, email addresses or phone numbers.",
    "- Never invent facts (prices, dates, codes).",
  ].join("\n");
  return { system, user: input.protectedContent };
}

/** The original content with merge tags swapped for placeholders, plus how to undo that. */
export function prepareImprove(content: string) {
  return protectMergeTags(content);
}

/**
 * Checks and cleans the AI's rewrite. Returns the new HTML (heading/text) or
 * label (button). Throws AiError("bad_output", reason) when it can't be used.
 */
export function acceptImproved(
  blockType: ImprovableBlock,
  original: string,
  restore: ReturnType<typeof protectMergeTags>["restore"],
  answer: z.output<typeof improveAnswerSchema>,
): string {
  const restored = restore(answer.text);
  if (!restored.ok) throw new AiError("bad_output", restored.error);

  let result: string;
  if (blockType === "button") {
    result = cleanLine(restored.text, 120);
  } else {
    result = sanitizeRichText(restored.text, { inline: blockType === "heading" }).trim();
    if (blockType === "text" && result && !/^<(p|ul|ol)\b/.test(result)) result = `<p>${result}</p>`;
    if (!linksAreUnchanged(original, result)) {
      throw new AiError("bad_output", "The AI tried to change a link, so we didn't use its answer. Please try again.");
    }
  }

  const plain = result.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
  if (!plain) throw new AiError("bad_output");
  if (result.length > 20_000) throw new AiError("bad_output", "The AI's answer was too long, so we didn't use it.");

  // Belt and braces: the final text must have exactly the original merge tags.
  const tagProblem = compareMergeTags(original, result);
  if (tagProblem) throw new AiError("bad_output", tagProblem);
  return result;
}
